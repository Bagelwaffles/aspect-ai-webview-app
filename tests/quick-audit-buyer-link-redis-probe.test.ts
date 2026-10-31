import assert from "node:assert/strict"
import test from "node:test"
import { probeBuyerLinkRedisWrite, type BuyerLinkWriteProbeRedis } from "../lib/server/quick-audit-buyer-link-redis-probe"

function safeEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "feat/ams-audit-buyer-link-integration-20261029",
    AMS_STRIPE_PILOT_ACCOUNT_ID: "acct_1UTtFMGuhFCl8JHa",
    AMS_STRIPE_PILOT_REDIS_REST_URL: "https://internal-chicken-238070.upstash.io",
    AMS_STRIPE_PILOT_REDIS_REST_TOKEN: "synthetic-diagnostic-token",
    AMS_STRIPE_PILOT_REDIS_NAMESPACE: "ams:preview:stripe-pilot:synthetic-probe:",
    AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL: "https://accepted-quetzal-206056.upstash.io",
    UPSTASH_REDIS_REST_URL: "https://unrelated-preview.upstash.io",
    AMS_QUICK_AUDIT_BUYER_DISPATCH_ENABLED: "false",
    AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "false",
    AMS_QUICK_AUDIT_PILOT_DISPATCH_ENABLED: "false",
    AMS_STRIPE_PILOT_FULFILLMENT_ENABLED: "false",
    AMS_STRIPE_PILOT_CHECKOUT_ENABLED: "false",
    AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED: "false",
    AMS_STRIPE_PILOT_HANDOFF_ENABLED: "false",
    AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED: "false",
    AMS_QUICK_AUDIT_PUBLIC_CHECKOUT_ENABLED: "false",
  }
}

test("disposable buyer-link write/read/delete succeeds without delivery", async () => {
  const records = new Map<string, string>()
  let writes = 0
  let deletions = 0
  const redis: BuyerLinkWriteProbeRedis = {
    set: async (key, value, options) => {
      assert.match(key, /^ams:quick-audit:buyer-link:delivery:probe-[a-f0-9]{32}$/)
      assert.equal(options.nx, true)
      assert.equal(options.ex, 45)
      writes++
      records.set(key, value)
      return "OK"
    },
    get: async key => records.get(key) ?? null,
    del: async key => { deletions++; return records.delete(key) ? 1 : 0 },
  }
  assert.deepEqual(await probeBuyerLinkRedisWrite({ env: safeEnv(), redis }), {
    ok: true, code: "BUYER_LINK_REDIS_PROBE_PASS",
  })
  assert.equal(writes, 1)
  assert.equal(deletions, 1)
  assert.equal(records.size, 0)
})

test("read-only Redis credentials return sanitized classification, no send", async () => {
  const redis: BuyerLinkWriteProbeRedis = {
    set: async () => { throw new Error("NOPERM restricted token: secret-should-not-leak") },
    get: async () => { throw new Error("unreachable") },
    del: async () => { throw new Error("unreachable") },
  }
  const result = await probeBuyerLinkRedisWrite({ env: safeEnv(), redis })
  assert.deepEqual(result, { ok: false, code: "BUYER_LINK_REDIS_WRITE_FORBIDDEN" })
  assert.doesNotMatch(JSON.stringify(result), /secret-should-not-leak/)
})

test("all sending switches must be explicitly off; wrong datastore is rejected", async () => {
  let calls = 0
  const redis: BuyerLinkWriteProbeRedis = {
    set: async () => { calls++; return "OK" },
    get: async () => null,
    del: async () => 1,
  }
  const armed = { ...safeEnv(), AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "true" }
  assert.equal((await probeBuyerLinkRedisWrite({ env: armed, redis })).code, "BUYER_LINK_REDIS_SCOPE_DENIED")
  const wrong = { ...safeEnv(), AMS_STRIPE_PILOT_REDIS_REST_URL: "https://unrelated-preview.upstash.io" }
  assert.equal((await probeBuyerLinkRedisWrite({ env: wrong, redis })).code, "BUYER_LINK_REDIS_STORAGE_UNVERIFIED")
  assert.equal(calls, 0)
})

test("successful write with failed deletion is not reported as passing", async () => {
  const redis: BuyerLinkWriteProbeRedis = {
    set: async () => "OK",
    get: async () => null,
    del: async () => 0,
  }
  assert.equal((await probeBuyerLinkRedisWrite({ env: safeEnv(), redis })).code, "BUYER_LINK_REDIS_CLEANUP_UNCONFIRMED")
})
