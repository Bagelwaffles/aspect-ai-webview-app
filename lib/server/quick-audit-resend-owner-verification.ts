/** Ephemeral owner maintenance only. Never log, persist, or echo the key. */
import { createHash } from "node:crypto"
import { inspectResendPreviewPreflight } from "./quick-audit-resend-preview-preflight"
import { PreviewResendDomainProofStore, verifyAndRecordResendDomainForOwner } from "./quick-audit-resend-domain-proof-store"

export interface OwnerVerificationRedis {
  get<T = unknown>(key: string): Promise<T | null>
  set(key: string, value: string, options: { ex: number; nx?: true }): Promise<unknown>
}

export function ownerDomainVerificationEnabled(env: NodeJS.ProcessEnv, now = Date.now()) {
  const until = Date.parse(env.AMS_RESEND_OWNER_VERIFY_UNTIL ?? "")
  return inspectResendPreviewPreflight(env).status === "configuration-ready" &&
    Number.isFinite(until) && until > now && until - now <= 15 * 60_000 &&
    ["AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED", "AMS_STRIPE_PILOT_FULFILLMENT_ENABLED",
      "AMS_QUICK_AUDIT_PILOT_DISPATCH_ENABLED", "AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED",
      "AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED"].every(name => env[name] !== "true")
}

function reply(code: string, status: number) {
  return Response.json({ ok: status === 200, code, emailSent: false, paymentPerformed: false,
    proofWrittenAndRead: status === 200 && code === "OWNER_DOMAIN_VERIFY_PROOF_WRITTEN_AND_READ" }, {
    status, headers: { "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff" },
  })
}

async function boundedBody(request: Request): Promise<string> {
  if (!request.body) throw new Error("EMPTY")
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("BODY_LIMIT")), 5000)
  })
  try {
    while (true) {
      const next = await Promise.race([reader.read(), timeout])
      if (next.done) break
      size += next.value.byteLength
      if (size > 1024) throw new Error("BODY_LIMIT")
      chunks.push(next.value)
    }
    const joined = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength }
    return new TextDecoder("utf-8", { fatal: true }).decode(joined)
  } finally {
    clearTimeout(timer)
    void reader.cancel().catch(() => undefined)
  }
}

export async function handleOwnerDomainVerification(request: Request, input: {
  env: NodeJS.ProcessEnv
  authorize: () => Promise<{ ok: boolean; status?: number }>
  redis: () => OwnerVerificationRedis
  fetcher?: typeof fetch
  now?: Date
}): Promise<Response> {
  if (request.method !== "POST") return reply("OWNER_DOMAIN_VERIFY_POST_ONLY", 405)
  // Reject before reading credentials or constructing any datastore client.
  if (!ownerDomainVerificationEnabled(input.env, input.now?.getTime())) {
    return reply("OWNER_DOMAIN_VERIFY_DISABLED", 403)
  }
  try {
    const url = new URL(request.url)
    const expected = new URL(input.env.PUBLIC_APP_URL ?? input.env.NEXTAUTH_URL ?? "")
    // Distinguish origin failures without exposing hosts, request headers or
    // changing any of the existing authorization requirements.
    if (url.protocol !== "https:" || expected.protocol !== "https:" || url.search) {
      return reply("OWNER_DOMAIN_VERIFY_ORIGIN_URL_DENIED", 403)
    }
    if (request.headers.get("origin") !== url.origin) {
      return reply("OWNER_DOMAIN_VERIFY_ORIGIN_HEADER_DENIED", 403)
    }
    // The immutable deployment hostname is a Vercel-managed alternate for the
    // signed-in Preview branch alias. Accept ONLY the platform-supplied hostname
    // for this exact project/team while preserving same-origin fetch, HTTPS,
    // owner session, and the configured branch-alias requirements.
    const platformHost = input.env.VERCEL_ENV === "preview" &&
      input.env.VERCEL_GIT_COMMIT_REF === "feat/ams-audit-buyer-link-integration-20261029" &&
      /^aspect-ai-overlord-[a-z0-9]{8,15}-kimberleyaversbiz-4131s-projects\.vercel\.app$/.test(
        input.env.VERCEL_URL ?? ""
      ) ? `https://${input.env.VERCEL_URL}` : null
    if (url.origin !== expected.origin && url.origin !== platformHost) {
      return reply("OWNER_DOMAIN_VERIFY_ORIGIN_EXPECTED_DENIED", 403)
    }
    if (request.headers.get("sec-fetch-site") !== "same-origin") {
      return reply("OWNER_DOMAIN_VERIFY_ORIGIN_FETCH_SITE_DENIED", 403)
    }
    const auth = await input.authorize()
    if (!auth.ok) return reply("OWNER_DOMAIN_VERIFY_OWNER_REQUIRED", auth.status === 403 ? 403 : 401)
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" ||
        request.headers.has("content-encoding")) return reply("OWNER_DOMAIN_VERIFY_INVALID_REQUEST", 400)
    const length = request.headers.get("content-length")
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > 1024)) {
      return reply("OWNER_DOMAIN_VERIFY_BODY_LIMIT", 413)
    }
    let payload: unknown
    try { payload = JSON.parse(await boundedBody(request)) } catch {
      return reply("OWNER_DOMAIN_VERIFY_INVALID_REQUEST", 400)
    }
    // Read-only owner/browser diagnostic: validates the exact POST origin,
    // session, expiry and content-type WITHOUT a key, Redis access, proof
    // write, attempt consumption, or provider request.
    if (payload && typeof payload === "object" && !Array.isArray(payload) &&
        Object.keys(payload).length === 1 && "checkOnly" in payload &&
        payload.checkOnly === true) return reply("OWNER_DOMAIN_VERIFY_PREFLIGHT_READY", 200)
    if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
        Object.keys(payload).length !== 1 || !("fullAccessKey" in payload) ||
        typeof payload.fullAccessKey !== "string" ||
        !/^re_[A-Za-z0-9_-]{20,200}$/.test(payload.fullAccessKey)) {
      return reply("OWNER_DOMAIN_VERIFY_INVALID_CREDENTIAL", 400)
    }
    const redis = input.redis()
    const namespace = input.env.AMS_QUICK_AUDIT_RESEND_PROOF_NAMESPACE!
    const attempt = createHash("sha256").update(input.env.AMS_RESEND_OWNER_VERIFY_UNTIL!).digest("hex")
    // One attempt per owner-configured window; stores a constant, never a key/hash of a key.
    const claimed = await redis.set(namespace + "domain-verification-attempt:" + attempt,
      "consumed", { nx: true, ex: 900 })
    if (claimed !== "OK" && claimed !== true) return reply("OWNER_DOMAIN_VERIFY_WINDOW_CONSUMED", 409)
    const store = new PreviewResendDomainProofStore(redis, namespace,
      input.now ? () => input.now! : () => new Date())
    let verified = false
    try {
      verified = await verifyAndRecordResendDomainForOwner({
        fullAccessKey: payload.fullAccessKey, env: input.env, proofStore: store,
        fetcher: input.fetcher, now: input.now,
      })
    } finally { payload.fullAccessKey = "" }
    if (!verified) return reply("OWNER_DOMAIN_VERIFY_PROVIDER_REJECTED", 502)
    if (!await store.readDomainProof()) return reply("OWNER_DOMAIN_VERIFY_READBACK_FAILED", 503)
    return reply("OWNER_DOMAIN_VERIFY_PROOF_WRITTEN_AND_READ", 200)
  } catch {
    // Never propagate upstream errors, headers, request body, or credentials.
    return reply("OWNER_DOMAIN_VERIFY_UNAVAILABLE", 503)
  }
}
