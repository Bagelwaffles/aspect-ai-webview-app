import assert from "node:assert/strict";
import test from "node:test";
import { createReceiver, verifyStripeHeader } from "../tools/pr295-acceptance/stripe-replay-worker.mjs";

const NOW = Date.parse("2026-10-27T05:00:00.000Z");
const SECRET = "whsec_synthetic_fixture_only";
const RECEIVER = "https://pr295-ephemeral-fixture.workers.dev/webhook";
const redis = "https://pretty-crab-239388.upstash.io/";

const environment = {
  RECEIVER_ENABLED: "true",
  RECEIVER_UNTIL_UTC: new Date(NOW + 5 * 60000).toISOString(),
  STRIPE_TEST_SIGNING_SECRET: SECRET,
  UPSTASH_REST_URL: redis,
  UPSTASH_RECEIPT_WRITE_TOKEN: "synthetic-unprivileged-token",
};

async function signature(raw, at = NOW, secret = SECRET) {
  const t = Math.floor(at / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), {
    name: "HMAC", hash: "SHA-256",
  }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`));
  const hex = Array.from(new Uint8Array(bytes), (x) => x.toString(16).padStart(2, "0")).join("");
  return `t=${t},v1=${hex}`;
}

function event(id = "evt_SyntheticPr295Fixture") {
  return {
    id,
    object: "event",
    type: "test_helpers.test_clock.created",
    livemode: false,
    context: "acct_1Smr2bGloGM6sjzB",
    data: { object: { id: "clock_fixture", object: "test_helpers.test_clock" } },
  };
}

async function send(handler, payload = event(), sig = null, url = RECEIVER) {
  const raw = JSON.stringify(payload);
  const header = sig ?? await signature(raw);
  return handler(new Request(url, {
    method: "POST",
    headers: { "stripe-signature": header, "content-type": "application/json" },
    body: raw,
  }), environment);
}

test("the exact signed Stripe payload is accepted, stale and forged signatures are rejected", async () => {
  const raw = JSON.stringify(event());
  assert.equal(await verifyStripeHeader(raw, await signature(raw), SECRET, NOW), true);
  assert.equal(await verifyStripeHeader(raw, await signature(raw, NOW - 400000), SECRET, NOW), false);
  assert.equal(await verifyStripeHeader(raw + " ", await signature(raw), SECRET, NOW), false);
  assert.equal(await verifyStripeHeader(raw, "t=1793077200,v1=not-a-hex-digest", SECRET, NOW), false);
});

test("same genuine-format event processed once and counted twice at the atomic receipt boundary", async () => {
  const receipts = new Map();
  let calls = 0;
  const handler = createReceiver({
    now: () => NOW,
    fetchRedis: async (_url, init) => {
      calls++;
      assert.equal(init.headers.authorization, "Bearer synthetic-unprivileged-token");
      const [command, lua, keys, receiptKey, eventType] = JSON.parse(init.body);
      assert.equal(command, "EVAL");
      assert.match(lua, /HINCRBY/);
      assert.equal(keys, "1");
      assert.equal(eventType, "test_helpers.test_clock.created");
      const previous = receipts.get(receiptKey) ?? { deliveryCount: 0, processingCount: 0 };
      previous.deliveryCount++;
      if (previous.deliveryCount === 1) previous.processingCount++;
      receipts.set(receiptKey, previous);
      return new Response(JSON.stringify({
        result: [previous.deliveryCount, previous.processingCount],
      }), { status: 200 });
    },
  });
  const first = await send(handler);
  const again = await send(handler);
  assert.equal(first.status, 200);
  assert.equal(again.status, 200);
  assert.deepEqual(await first.json(), {
    code: "FIRST_DELIVERY", eventId: "evt_SyntheticPr295Fixture",
    deliveryCount: 1, processingCount: 1,
  });
  assert.deepEqual(await again.json(), {
    code: "DUPLICATE_DELIVERY", eventId: "evt_SyntheticPr295Fixture",
    deliveryCount: 2, processingCount: 1,
  });
  assert.equal(calls, 2);
  assert.equal(receipts.size, 1);
});

test("fail-closed gating refuses disabled intake, wrong account, live events and wrong routes", async () => {
  let writes = 0;
  const handler = createReceiver({ now: () => NOW, fetchRedis: async () => {
    writes++;
    return new Response(JSON.stringify({ result: [1, 1] }));
  } });
  const payload = event();
  const disabled = await handler(new Request(RECEIVER, { method: "POST" }), {
    ...environment, RECEIVER_ENABLED: "false",
  });
  assert.equal(disabled.status, 503);
  const past = await handler(new Request(RECEIVER, { method: "POST" }), {
    ...environment, RECEIVER_UNTIL_UTC: new Date(NOW - 1000).toISOString(),
  });
  assert.equal(past.status, 503);
  const tooFar = await handler(new Request(RECEIVER, { method: "POST" }), {
    ...environment, RECEIVER_UNTIL_UTC: new Date(NOW + 11 * 60000).toISOString(),
  });
  assert.equal(tooFar.status, 503);
  assert.equal((await send(handler, { ...payload, livemode: true })).status, 403);
  assert.equal((await send(handler, { ...payload, context: "acct_different" })).status, 403);
  assert.equal((await send(handler, { ...payload, type: "checkout.session.completed" })).status, 403);
  assert.equal((await send(handler, payload, null, RECEIVER.replace("/webhook", "/wrong"))).status, 404);
  assert.equal(writes, 0);
});

test("failed persistence returns retriable HTTP 503; secrets and payload never appear in response", async () => {
  const handler = createReceiver({
    now: () => NOW,
    fetchRedis: async () => new Response(JSON.stringify({ error: "blocked" }), { status: 400 }),
  });
  const response = await send(handler);
  assert.equal(response.status, 503);
  const text = await response.text();
  assert.equal(text.includes(SECRET), false);
  assert.equal(text.includes(environment.UPSTASH_RECEIPT_WRITE_TOKEN), false);
});

test("untrusted oversized bodies are rejected before a Redis call, even without Content-Length", async () => {
  let redisCalls = 0;
  const handler = createReceiver({
    now: () => NOW,
    fetchRedis: async () => {
      redisCalls++;
      throw new Error("Must not contact Redis");
    },
  });
  const oversized = new Request(RECEIVER, {
    method: "POST",
    headers: { "stripe-signature": "invalid" },
    body: "X".repeat(70000),
  });
  assert.equal(oversized.headers.get("content-length"), null);
  const response = await handler(oversized, environment);
  assert.equal(response.status, 413);
  assert.equal((await response.json()).code, "PAYLOAD_TOO_LARGE");
  assert.equal(redisCalls, 0);

  // A payload just over the size limit cannot slip through a chunked stream.
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("a".repeat(32000)));
      controller.enqueue(new TextEncoder().encode("b".repeat(34000)));
      controller.close();
    },
  });
  const streamed = new Request(RECEIVER, {
    method: "POST",
    headers: { "stripe-signature": "invalid" },
    body: stream,
    duplex: "half",
  });
  const streamedResponse = await handler(streamed, environment);
  assert.equal(streamedResponse.status, 413);
  assert.equal(redisCalls, 0);
});

test("snapshot event shape is required and thin event shape is rejected", async () => {
  let redisCalls = 0;
  const handler = createReceiver({
    now: () => NOW,
    fetchRedis: async () => {
      redisCalls++;
      return new Response(JSON.stringify({ result: [1, 1] }), { status: 200 });
    },
  });
  // Stripe Workbench must use the SNAPSHOT payload option for this receiver.
  const thin = {
    id: "evt_SyntheticThinFixture",
    object: "event",
    livemode: false,
    type: "test_helpers.test_clock.created",
    context: "acct_1Smr2bGloGM6sjzB",
    related_object: { id: "clock_test" },
  };
  const response = await send(handler, thin);
  assert.equal(response.status, 403);
  assert.equal(redisCalls, 0);
});
