/**
 * TEMPORARY AND NON-PAYMENT ONLY: PR #295 Stripe-origin replay acceptance.
 * Deploy in a NEW standalone Cloudflare Worker, never the AMS website.
 * This is a receipt-only transport test. It does not invoke audit fulfillment.
 * Delete the Worker and its Stripe destination in the SAME acceptance session.
 */
const ROUTE = "/webhook";
const EXPECTED_ACCOUNT = "acct_1Smr2bGloGM6sjzB";
const EXPECTED_REDIS_HOST = "pretty-crab-239388.upstash.io";
const EVENT_TYPE = "test_helpers.test_clock.created";
const MAX_WINDOW_MS = 10 * 60 * 1000;
const SIGNATURE_TOLERANCE_SECONDS = 300;
const RECEIPT_TTL_SECONDS = 86400;

const ATOMIC_RECEIPT_SCRIPT = `
local count = redis.call('HINCRBY', KEYS[1], 'deliveryCount', 1)
if count == 1 then
  redis.call('HSET', KEYS[1],
    'processingCount', 1, 'status', 'completed',
    'eventType', ARGV[1], 'firstSeenAt', ARGV[2],
    'lastSeenAt', ARGV[2])
  redis.call('EXPIRE', KEYS[1], 86400)
else
  redis.call('HSET', KEYS[1], 'lastSeenAt', ARGV[2])
end
return {count, tonumber(redis.call('HGET', KEYS[1], 'processingCount'))}
`;

function reply(code, message, extra = {}) {
  return new Response(JSON.stringify({ code: message, ...extra }), {
    status: code,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function validWindow(env, nowMs) {
  if (env.RECEIVER_ENABLED !== "true") return false;
  const end = Date.parse(env.RECEIVER_UNTIL_UTC || "");
  return Number.isFinite(end) && end > nowMs && end - nowMs <= MAX_WINDOW_MS;
}

function toBytes(hex) {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  return Uint8Array.from(hex.match(/.{2}/g), (part) => parseInt(part, 16));
}

export async function verifyStripeHeader(raw, header, secret, nowMs) {
  if (!header || !secret || !secret.startsWith("whsec_")) return false;
  const parts = header.split(",").map((p) => p.trim());
  const timestampField = parts.find((p) => p.startsWith("t="));
  const timestampText = timestampField?.slice(2) ?? "";
  if (!/^\d{10,11}$/.test(timestampText)) return false;
  const timestamp = Number(timestampText);
  if (Math.abs(nowMs / 1000 - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const signatures = parts.filter((p) => p.startsWith("v1=")).slice(0, 8);
  if (!signatures.length) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
  );
  const signedPayload = encoder.encode(`${timestamp}.${raw}`);
  for (const candidate of signatures) {
    const signatureBytes = toBytes(candidate.slice(3));
    if (signatureBytes && await crypto.subtle.verify(
      "HMAC", key, signatureBytes, signedPayload,
    )) return true;
  }
  return false;
}

function validRedisUrl(text) {
  try {
    const u = new URL(text);
    return u.protocol === "https:" && u.hostname === EXPECTED_REDIS_HOST &&
      u.pathname === "/" && !u.search && !u.hash && !u.username && !u.password && !u.port;
  } catch { return false; }
}

export function createReceiver({ fetchRedis = fetch, now = () => Date.now() } = {}) {
  return async function handle(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== ROUTE) return reply(404, "NOT_FOUND");
    if (request.method !== "POST") return reply(405, "METHOD_NOT_ALLOWED");
    if (!validWindow(env, now())) return reply(503, "RECEIVER_DISABLED");
    if (!validRedisUrl(env.UPSTASH_REST_URL ?? "") ||
        !env.UPSTASH_RECEIPT_WRITE_TOKEN ||
        !env.STRIPE_TEST_SIGNING_SECRET) {
      return reply(503, "RECEIVER_MISCONFIGURED");
    }
    const length = Number(request.headers.get("content-length") || "0");
    if (length > 65536) return reply(413, "PAYLOAD_TOO_LARGE");
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 65536) {
      return reply(413, "PAYLOAD_TOO_LARGE");
    }
    if (!await verifyStripeHeader(
      raw, request.headers.get("stripe-signature"),
      env.STRIPE_TEST_SIGNING_SECRET, now(),
    )) return reply(400, "INVALID_SIGNATURE");

    let event;
    try { event = JSON.parse(raw); }
    catch { return reply(400, "INVALID_EVENT"); }
    if (event?.livemode !== false || event?.type !== EVENT_TYPE ||
        !/^evt_[A-Za-z0-9]+$/.test(event?.id ?? "") ||
        event?.data?.object?.object !== "test_helpers.test_clock" ||
        (event.context && event.context !== EXPECTED_ACCOUNT) ||
        (event.account && event.account !== EXPECTED_ACCOUNT)) {
      return reply(403, "EVENT_NOT_ALLOWED");
    }

    const key = `ams:pr295:acceptance-v2:receipt:${event.id}`;
    const body = ["EVAL", ATOMIC_RECEIPT_SCRIPT, "1", key, EVENT_TYPE, new Date(now()).toISOString()];
    let result;
    try {
      const response = await fetchRedis(env.UPSTASH_REST_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.UPSTASH_RECEIPT_WRITE_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) return reply(503, "RECEIPT_STORE_FAILED");
      const json = await response.json();
      if (json.error || !Array.isArray(json.result) || json.result.length !== 2) {
        return reply(503, "RECEIPT_STORE_FAILED");
      }
      result = json.result.map(Number);
      if (!result.every(Number.isSafeInteger) || result[0] < 1 || result[1] !== 1) {
        return reply(503, "RECEIPT_STORE_FAILED");
      }
    } catch {
      return reply(503, "RECEIPT_STORE_FAILED");
    }
    return reply(200, result[0] === 1 ? "FIRST_DELIVERY" : "DUPLICATE_DELIVERY", {
      eventId: event.id, deliveryCount: result[0], processingCount: result[1],
    });
  };
}

export default { fetch: createReceiver() };
