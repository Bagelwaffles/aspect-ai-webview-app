import { test } from "node:test"
import assert from "node:assert/strict"
import { handleOwnerDomainVerification, type OwnerVerificationRedis } from "../lib/server/quick-audit-resend-owner-verification"
import { AMS_RESEND_DOMAIN_ID, AMS_RESEND_DOMAIN } from "../lib/server/quick-audit-resend-domain-proof"
import { PreviewResendDomainProofStore } from "../lib/server/quick-audit-resend-domain-proof-store"
import { RESEND_PREVIEW_BRANCH } from "../lib/server/quick-audit-resend-preview-preflight"

const now = new Date("2026-10-24T04:00:00Z")
const origin = "https://owner-preview.example.test"
const key = "re_" + "synthetic_fixture_".repeat(3)
const env: NodeJS.ProcessEnv = {
  NODE_ENV: "test", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: RESEND_PREVIEW_BRANCH,
  PUBLIC_APP_URL: origin, AMS_RESEND_OWNER_VERIFY_UNTIL: new Date(now.getTime() + 600_000).toISOString(),
  AMS_RESEND_SEND_API_KEY: "synthetic-sending-only", AMS_RESEND_DOMAIN_ID,
  AMS_OWNER_EMAIL: "owner@example.test", AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL: "owner@example.test",
  AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL: "https://accepted-quetzal-206056.upstash.io",
  AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_TOKEN: "synthetic-proof-only",
  AMS_QUICK_AUDIT_RESEND_PROOF_NAMESPACE: "ams:preview:quick-audit:owner-verify-test:",
}
function fixture() {
  const values = new Map<string, string>()
  const writes: Array<{ key: string; value: string; ex: number }> = []
  let requests = 0, clients = 0
  const redis: OwnerVerificationRedis = {
    async get<T>(k: string) { return (values.get(k) ?? null) as T | null },
    async set(k, value, options) {
      if (options.nx && values.has(k)) return null
      writes.push({ key: k, value, ex: options.ex }); values.set(k, value); return "OK"
    },
  }
  const provider = { id: AMS_RESEND_DOMAIN_ID, name: AMS_RESEND_DOMAIN,
    status: "verified", capabilities: { sending: "enabled" } }
  const input = {
    env, now,
    authorize: async () => ({ ok: true }),
    redis: () => { clients++; return redis },
    fetcher: (async (url: string | URL | Request, init?: RequestInit) => {
      requests++
      assert.equal(url, `https://api.resend.com/domains/${AMS_RESEND_DOMAIN_ID}`)
      assert.equal(init?.method, "GET")
      assert.equal(init?.redirect, "error")
      assert.equal((init?.headers as Record<string, string>).Authorization, `Bearer ${key}`)
      return Response.json(provider)
    }) as typeof fetch,
  }
  return { input, redis, provider, writes, values, get requests() { return requests }, get clients() { return clients } }
}
function request(body: unknown = { fullAccessKey: key }, headers: Record<string, string> = {}) {
  return new Request(origin + "/api/internal/quick-audit-resend-domain-verify", {
    method: "POST", headers: { origin, "sec-fetch-site": "same-origin", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  })
}
test("owner authorization and trusted origin reject before credentials, clients or provider access", async () => {
  const f = fixture()
  assert.equal((await handleOwnerDomainVerification(request(), { ...f.input,
    authorize: async () => ({ ok: false, status: 401 }) })).status, 401)
  for (const headers of [{ origin: "https://hostile.example.test", "sec-fetch-site": "same-origin" }, { origin, "sec-fetch-site": "cross-site" }]) {
    assert.equal((await handleOwnerDomainVerification(request(undefined, headers), f.input)).status, 403)
  }
  assert.equal(f.clients, 0); assert.equal(f.requests, 0)
})
test("production, wrong branch, expired/absent/overlong windows and enabled operations fail closed", async () => {
  const f = fixture()
  for (const change of [
    { VERCEL_ENV: "production" }, { VERCEL_GIT_COMMIT_REF: "main" },
    { AMS_RESEND_OWNER_VERIFY_UNTIL: "" }, { AMS_RESEND_OWNER_VERIFY_UNTIL: now.toISOString() },
    { AMS_RESEND_OWNER_VERIFY_UNTIL: new Date(now.getTime() + 901_000).toISOString() },
    ...["AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED", "AMS_STRIPE_PILOT_FULFILLMENT_ENABLED",
      "AMS_QUICK_AUDIT_PILOT_DISPATCH_ENABLED", "AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED",
      "AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED"].map(name => ({ [name]: "true" })),
  ]) assert.equal((await handleOwnerDomainVerification(request(), { ...f.input, env: { ...env, ...change } })).status, 403)
  assert.equal(f.clients, 0); assert.equal(f.requests, 0)
})
test("malformed or oversized input and query credentials are rejected without any provider/store access", async () => {
  const f = fixture()
  for (const body of [{}, [], null, { fullAccessKey: "invalid" }, { fullAccessKey: key, extra: true }]) {
    assert.equal((await handleOwnerDomainVerification(request(body), f.input)).status, 400)
  }
  assert.equal((await handleOwnerDomainVerification(request({ fullAccessKey: "x".repeat(1500) }), f.input)).status, 400)
  assert.equal((await handleOwnerDomainVerification(request(undefined, { "content-length": "1025" }), f.input)).status, 413)
  const queryRequest = new Request(origin + "/api/internal/quick-audit-resend-domain-verify?key=forbidden", {
    method: "POST", headers: { origin, "sec-fetch-site": "same-origin" }, body: "{}",
  })
  assert.equal((await handleOwnerDomainVerification(queryRequest, f.input)).status, 403)
  assert.equal(f.clients, 0); assert.equal(f.requests, 0)
})
test("one fixed-domain provider request writes only independent 900-second proof and reads it back", async () => {
  const f = fixture()
  const result = await handleOwnerDomainVerification(request(), f.input)
  assert.equal(result.status, 200)
  const text = await result.text()
  assert.ok(!text.includes(key))
  assert.equal(JSON.parse(text).proofWrittenAndRead, true)
  assert.equal(result.headers.get("cache-control"), "no-store, max-age=0")
  assert.equal(f.requests, 1)
  assert.equal(f.writes.length, 2)
  assert.ok(f.writes.every(w => w.ex === 900 && !w.value.includes(key)))
  const proof = await new PreviewResendDomainProofStore(f.redis, env.AMS_QUICK_AUDIT_RESEND_PROOF_NAMESPACE!, () => now).readDomainProof()
  assert.equal(proof?.source, "resend-domain-api")
  assert.equal(proof?.domainId, AMS_RESEND_DOMAIN_ID)
  assert.equal((await handleOwnerDomainVerification(request(), f.input)).status, 409)
  assert.equal(f.requests, 1, "second request cannot call the provider")
})
test("wrong domain, status, capability and provider failures cannot produce proof", async () => {
  for (const change of [{ id: "wrong" }, { name: "wrong.test" }, { status: "pending" }, { capabilities: { sending: "disabled" } }]) {
    const f = fixture(); Object.assign(f.provider, change)
    assert.equal((await handleOwnerDomainVerification(request(), f.input)).status, 502)
    assert.equal(f.writes.length, 1, "only attempt guard is stored")
  }
  const f = fixture()
  const result = await handleOwnerDomainVerification(request(), { ...f.input,
    fetcher: async () => { throw new Error(key) } })
  assert.equal(result.status, 502); assert.ok(!(await result.text()).includes(key))
})
test("proof write/read failures never report success, and existing store rejects fabricated/expired records", async () => {
  const f = fixture()
  const bad = { ...f.redis, async set(k: string, value: string, options: { ex: number; nx?: true }) {
    if (!options.nx) throw new Error(key)
    return f.redis.set(k, value, options)
  } }
  const result = await handleOwnerDomainVerification(request(), { ...f.input, redis: () => bad })
  assert.equal(result.status, 503); assert.ok(!(await result.text()).includes(key))
  const store = new PreviewResendDomainProofStore(f.redis, env.AMS_QUICK_AUDIT_RESEND_PROOF_NAMESPACE!, () => now)
  await assert.rejects(store.saveOwnerVerifiedProof({ ...f.provider, domainId: AMS_RESEND_DOMAIN_ID,
    domainName: AMS_RESEND_DOMAIN, status: "verified", sending: "enabled", source: "resend-domain-api",
    verifiedAt: new Date(now.getTime() - 901_000).toISOString() }))
  assert.equal(await store.readDomainProof(), null)
})


test("no-key owner browser preflight validates request and consumes no attempts or Redis access", async () => {
  const f = fixture()
  const response = await handleOwnerDomainVerification(request({ checkOnly: true }), f.input)
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.code, "OWNER_DOMAIN_VERIFY_PREFLIGHT_READY")
  assert.equal(body.proofWrittenAndRead, false)
  assert.equal(body.emailSent, false)
  assert.equal(body.paymentPerformed, false)
  assert.equal(f.clients, 0)
  assert.equal(f.requests, 0)
  assert.equal(f.writes.length, 0)
  const accepted = await handleOwnerDomainVerification(request(), f.input)
  assert.equal(accepted.status, 200, "diagnostic must not use the one real verification attempt")
  assert.equal(f.requests, 1)
})

test("no-key preflight fails closed for cross-origin, owner-denied and expired windows", async () => {
  const f = fixture()
  for (const [inputRequest, input] of [
    [request({ checkOnly: true }, { "sec-fetch-site": "cross-site" }), f.input],
    [request({ checkOnly: true }, { origin: "https://evil.example.test" }), f.input],
    [request({ checkOnly: true }), { ...f.input, authorize: async () => ({ ok: false, status: 401 }) }],
    [request({ checkOnly: true }), { ...f.input, env: { ...env, AMS_RESEND_OWNER_VERIFY_UNTIL: now.toISOString() } }],
  ] as const) {
    const response = await handleOwnerDomainVerification(inputRequest, input)
    assert.ok(response.status === 401 || response.status === 403)
    assert.equal((await response.json()).proofWrittenAndRead, false)
  }
  assert.equal(f.clients, 0)
  assert.equal(f.requests, 0)
  assert.equal(f.writes.length, 0)
})

test("no-key preflight requires exact shape and cannot make a claim through invalid payload", async () => {
  const f = fixture()
  for (const input of [
    { checkOnly: true, fullAccessKey: key },
    { checkOnly: "true" },
    { checkOnly: false },
  ]) {
    const response = await handleOwnerDomainVerification(request(input), f.input)
    assert.equal(response.status, 400)
    assert.equal((await response.json()).proofWrittenAndRead, false)
  }
  assert.equal(f.clients, 0)
  assert.equal(f.requests, 0)
  assert.equal(f.writes.length, 0)
})

test("Vercel deployment host is accepted only when it exactly matches the server-issued project deployment hostname", async () => {
  const host = "aspect-ai-overlord-8erod78qm-kimberleyaversbiz-4131s-projects.vercel.app"
  const deployedOrigin = `https://${host}`
  const deployedRequest = (headers: Record<string, string> = {}) => new Request(
    deployedOrigin + "/api/internal/quick-audit-resend-domain-verify", {
      method: "POST",
      headers: { origin: deployedOrigin, "sec-fetch-site": "same-origin", "content-type": "application/json", ...headers },
      body: JSON.stringify({ checkOnly: true }),
    }
  )
  const f = fixture()
  const safeEnv = { ...env, VERCEL_URL: host }
  const accepted = await handleOwnerDomainVerification(deployedRequest(), { ...f.input, env: safeEnv })
  assert.equal(accepted.status, 200)
  assert.equal((await accepted.json()).code, "OWNER_DOMAIN_VERIFY_PREFLIGHT_READY")
  for (const alternate of [
    { VERCEL_URL: "evil.example.test" },
    { VERCEL_URL: "other-project-8erod78qm-kimberleyaversbiz-4131s-projects.vercel.app" },
    { VERCEL_URL: undefined },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { VERCEL_ENV: "production" },
  ]) {
    const reply = await handleOwnerDomainVerification(deployedRequest(), {
      ...f.input, env: { ...safeEnv, ...alternate },
    })
    assert.equal(reply.status, 403)
  }
  assert.equal((await handleOwnerDomainVerification(
    deployedRequest({ origin: "https://hostile.example.test" }), { ...f.input, env: safeEnv }
  )).status, 403)
  assert.equal((await handleOwnerDomainVerification(
    deployedRequest({ "sec-fetch-site": "cross-site" }), { ...f.input, env: safeEnv }
  )).status, 403)
  assert.equal(f.clients, 0)
  assert.equal(f.requests, 0)
  assert.equal(f.writes.length, 0)
})
