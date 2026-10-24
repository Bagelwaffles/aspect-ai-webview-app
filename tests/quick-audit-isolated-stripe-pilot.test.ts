import { test } from "node:test"
import assert from "node:assert/strict"
import Stripe from "stripe"

import {
  AMS_PILOT_STRIPE_ACCOUNT,
  handlePilotStripeWebhook,
  pilotIntakeConfiguration,
  type PilotEventRedis,
} from "../lib/server/quick-audit-isolated-stripe-pilot"
import { RESEND_PREVIEW_BRANCH } from "../lib/server/quick-audit-resend-preview-preflight"

const secret = "whsec_preview_isolated_synthetic_secret_fixture_only"
const env: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: RESEND_PREVIEW_BRANCH,
  AMS_STRIPE_PILOT_ACCOUNT_ID: AMS_PILOT_STRIPE_ACCOUNT,
  AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED: "true",
  AMS_STRIPE_PILOT_WEBHOOK_SECRET: secret,
  AMS_STRIPE_PILOT_REDIS_REST_URL: "https://dedicated-stripe-pilot-67890.upstash.io",
  AMS_STRIPE_PILOT_REDIS_REST_TOKEN: "synthetic-unprivileged-fixture-token",
  AMS_STRIPE_PILOT_REDIS_NAMESPACE: "ams:preview:stripe-pilot:isolated-12345678:",
  AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL: "https://accepted-quetzal-206056.upstash.io",
}
const stripe = new Stripe("sk_test_synthetic_only_for_local_signature_generation")
const payload = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  id: "evt_1234567890safepilot",
  object: "event",
  type: "checkout.session.completed",
  livemode: false,
  data: { object: { id: "cs_test_syntheticonly", mode: "payment" } },
  ...overrides,
})
function signed(raw: string, signature = stripe.webhooks.generateTestHeaderString({ payload: raw, secret })) {
  return new Request("https://example.com/api/internal/quick-audit-stripe-pilot", {
    method: "POST",
    headers: { "Stripe-Signature": signature, "Content-Type": "application/json" },
    body: raw,
  })
}
function fakeRedis() {
  const records = new Map<string, string>()
  let writes = 0
  const store: PilotEventRedis = {
    async set(key, value) {
      writes += 1
      if (records.has(key)) return null
      records.set(key, value)
      return "OK"
    },
    async get(key) {
      return (records.get(key) ?? null) as never
    },
  }
  return { store, records, get writes() { return writes } }
}
async function result(request: Request, store: PilotEventRedis | null, settings = env) {
  const res = await handlePilotStripeWebhook(request, { env: settings, store,
    now: () => new Date("2026-10-23T19:00:00.000Z") })
  return { status: res.status, body: await res.json() as Record<string, unknown> }
}

test("isolated pilot intake requires exact branch, account, disabled mail and separate Redis", () => {
  assert.equal(pilotIntakeConfiguration(env).ready, true)
  for (const change of [
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { AMS_STRIPE_PILOT_ACCOUNT_ID: "acct_wrong" },
    { AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED: "false" },
    { AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "true" },
    { AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED: "true" },
    { AMS_STRIPE_PILOT_WEBHOOK_SECRET: "" },
    { AMS_STRIPE_PILOT_REDIS_REST_TOKEN: "" },
    { AMS_STRIPE_PILOT_REDIS_NAMESPACE: "ams:quick-audit:session:" },
    { AMS_STRIPE_PILOT_REDIS_REST_URL: env.AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL },
    { UPSTASH_REDIS_REST_URL: env.AMS_STRIPE_PILOT_REDIS_REST_URL },
    { KV_REST_API_URL: env.AMS_STRIPE_PILOT_REDIS_REST_URL },
    { AMS_STRIPE_PILOT_REDIS_REST_URL: "https://untrusted-upstash.io.evil.com" },
    { AMS_STRIPE_PILOT_REDIS_REST_URL: "http://dedicated-stripe-pilot-67890.upstash.io" },
  ]) {
    assert.equal(pilotIntakeConfiguration({ ...env, ...change }).ready, false, JSON.stringify(change))
  }
})

test("missing isolated datastore fails closed before accepting webhook", async () => {
  const f = fakeRedis()
  const res = await result(signed(payload()), null)
  assert.equal(res.status, 503)
  assert.equal(res.body.code, "PILOT_STORAGE_UNAVAILABLE")
  assert.equal(f.records.size, 0)
  const denied = await result(signed(payload()), f.store, { ...env, VERCEL_ENV: "production" })
  assert.equal(denied.status, 503)
  assert.equal(f.records.size, 0)
})

test("Stripe requires authentic raw body signature before recording anything", async () => {
  const f = fakeRedis()
  const absent = await result(new Request("https://example.com/pilot", { method: "POST", body: payload() }), f.store)
  assert.equal(absent.status, 400)
  assert.equal(absent.body.code, "PILOT_SIGNATURE_MISSING")
  const invalid = await result(signed(payload(), "t=1,v1=not-a-valid-signature"), f.store)
  assert.equal(invalid.status, 400)
  assert.equal(invalid.body.code, "PILOT_SIGNATURE_INVALID")
  assert.equal(f.records.size, 0)
})

test("valid sandbox checkout stores only a minimal isolated receipt and NEVER acknowledges fulfillment", async () => {
  const f = fakeRedis()
  const raw = payload()
  const first = await result(signed(raw), f.store)
  assert.equal(first.status, 503)
  assert.equal(first.body.code, "PILOT_FULFILLMENT_NOT_ENABLED")
  assert.equal(first.body.sendEnabled, false)
  assert.equal(first.body.fulfillmentEnabled, false)
  assert.equal(f.records.size, 1)
  const serialized = Array.from(f.records.values())[0]
  assert.match(serialized, /evt_1234567890safepilot/)
  assert.doesNotMatch(serialized, /cs_test_|customer|email|metadata/)
  const replay = await result(signed(raw), f.store)
  assert.equal(replay.status, 503)
  assert.equal(replay.body.duplicate, true)
  assert.equal(f.records.size, 1)
})

test("signed production and another-account events cannot enter Preview receipt store", async () => {
  const f = fakeRedis()
  for (const changed of [
    { livemode: true },
    { account: "acct_another_sandbox" },
    { id: "bad-id" },
  ]) {
    const res = await result(signed(payload(changed)), f.store)
    assert.equal(res.status, 403)
  }
  assert.equal(f.records.size, 0)
})

test("valid unrelated events are ignored with zero writes and zero sends", async () => {
  const f = fakeRedis()
  const res = await result(signed(payload({ type: "account.updated" })), f.store)
  assert.equal(res.status, 200)
  assert.equal(res.body.code, "PILOT_EVENT_IGNORED")
  assert.equal(f.records.size, 0)
})

test("unavailable store and conflicting event IDs always fail closed", async () => {
  const f = fakeRedis()
  const raw = payload()
  await result(signed(raw), f.store)
  const conflict = await result(signed(payload({ data: { object: { id: "cs_test_other" } } })), f.store)
  assert.equal(conflict.status, 409)
  assert.equal(conflict.body.code, "PILOT_EVENT_COLLISION")
  const broken: PilotEventRedis = {
    set: async () => { throw Error("unavailable") },
    get: async () => null,
  }
  const unavailable = await result(signed(raw), broken)
  assert.equal(unavailable.status, 503)
  assert.equal(unavailable.body.code, "PILOT_RECEIPT_STORE_UNAVAILABLE")
})
