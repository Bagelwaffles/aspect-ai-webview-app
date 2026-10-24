import { test } from "node:test"
import assert from "node:assert/strict"
import { runOwnerSignedStripePilotProbe, type SyntheticProbeRedis } from "../lib/server/quick-audit-stripe-pilot-selftest"
import { RESEND_PREVIEW_BRANCH } from "../lib/server/quick-audit-resend-preview-preflight"
import { AMS_PILOT_STRIPE_ACCOUNT } from "../lib/server/quick-audit-isolated-stripe-pilot"

const baseEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: RESEND_PREVIEW_BRANCH,
  AMS_STRIPE_PILOT_ACCOUNT_ID: AMS_PILOT_STRIPE_ACCOUNT,
  AMS_STRIPE_PILOT_WEBHOOK_SECRET: "whsec_synthetic_local_inprocess_selftest_only",
  AMS_STRIPE_PILOT_REDIS_REST_URL: "https://isolated-owner-test-example.upstash.io",
  AMS_STRIPE_PILOT_REDIS_REST_TOKEN: "synthetic-fixture-token",
  AMS_STRIPE_PILOT_REDIS_NAMESPACE: "ams:preview:stripe-pilot:selftest-12345:",
  AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL: "https://accepted-quetzal-206056.upstash.io",
}

function fakeStore() {
  const data = new Map<string, string>()
  let puts = 0, deletions = 0
  const store: SyntheticProbeRedis = {
    async get(key) { return (data.get(key) ?? null) as never },
    async set(key, value) {
      puts += 1
      if (data.has(key)) return null
      data.set(key, value)
      return "OK"
    },
    async del(key) {
      deletions += 1
      return Number(data.delete(key))
    },
  }
  return { data, store, get puts() { return puts }, get deletions() { return deletions } }
}

test("owner synthetic receipt test checks real Stripe HMAC, NX replay, and cleanup without charging or sending", async () => {
  const f = fakeStore()
  const result = await runOwnerSignedStripePilotProbe(baseEnv, f.store, {
    eventId: "evt_ownerprobe1234567890abcdef",
  })
  assert.equal(result.ok, true)
  assert.equal(result.code, "SIGNED_SYNTHETIC_RECEIPT_PROBE_PASSED")
  assert.ok(Object.values(result.checks).every(Boolean))
  assert.equal(result.stripeOriginVerified, false)
  assert.equal(result.paymentTestPerformed, false)
  assert.equal(result.emailSent, false)
  assert.equal(f.puts, 2, "one NX insert and one rejected duplicate")
  assert.equal(f.deletions, 1)
  assert.equal(f.data.size, 0)
  assert.equal(baseEnv.AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED, undefined,
    "module must not globally enable the webhook intake switch")
})

test("explicit real-service switches and wrong branch all block without any Redis commands", async () => {
  for (const change of [
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { AMS_STRIPE_PILOT_ACCOUNT_ID: "acct_wrong" },
    { AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED: "true" },
    { AMS_STRIPE_PILOT_FULFILLMENT_ENABLED: "true" },
    { AMS_QUICK_AUDIT_PILOT_DISPATCH_ENABLED: "true" },
    { AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "true" },
    { AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED: "true" },
    { AMS_STRIPE_PILOT_REDIS_REST_URL: baseEnv.AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL },
    { UPSTASH_REDIS_REST_URL: baseEnv.AMS_STRIPE_PILOT_REDIS_REST_URL },
    { AMS_STRIPE_PILOT_WEBHOOK_SECRET: "" },
  ]) {
    const f = fakeStore()
    const outcome = await runOwnerSignedStripePilotProbe({ ...baseEnv, ...change }, f.store)
    assert.equal(outcome.ok, false, JSON.stringify(change))
    assert.equal(outcome.code, "SIGNED_SYNTHETIC_RECEIPT_PROBE_BLOCKED")
    assert.equal(f.puts, 0)
    assert.equal(f.data.size, 0)
  }
})

test("existing test receipt cannot be overwritten or deleted by probe", async () => {
  const f = fakeStore()
  const id = "evt_ownerprobeexisting123456789"
  const key = baseEnv.AMS_STRIPE_PILOT_REDIS_NAMESPACE! + "event:" + id
  f.data.set(key, "protected-existing-receipt")
  const result = await runOwnerSignedStripePilotProbe(baseEnv, f.store, { eventId: id })
  assert.equal(result.ok, false)
  assert.equal(result.code, "SIGNED_SYNTHETIC_RECEIPT_PROBE_BLOCKED")
  assert.equal(f.data.get(key), "protected-existing-receipt")
  assert.equal(f.puts, 0)
  assert.equal(f.deletions, 0)
})

test("failed store writes never become a positive result or Stripe-origin proof", async () => {
  const f = fakeStore()
  const store: SyntheticProbeRedis = {
    ...f.store,
    async set() { throw new Error("isolated redis unavailable") },
  }
  const result = await runOwnerSignedStripePilotProbe(baseEnv, store, {
    eventId: "evt_ownerprobefail1234567890",
  })
  assert.equal(result.ok, false)
  assert.equal(result.stripeOriginVerified, false)
  assert.equal(result.paymentTestPerformed, false)
  assert.equal(result.emailSent, false)
  assert.equal(f.data.size, 0)
})
