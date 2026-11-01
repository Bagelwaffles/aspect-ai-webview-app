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


function fakeRedis(options: { forbidden?: boolean; rejectCas?: boolean; acceptReplay?: boolean; cleanupFails?: boolean; lostWrite?: boolean } = {}) {
  const records = new Map<string, string>()
  let evals = 0
  const seenKeys = new Set<string>()
  const redis: BuyerLinkWriteProbeRedis = {
    set: async (key, value, opts) => {
      assert.match(key, /^ams:quick-audit:buyer-link:delivery:probe-[a-f0-9]{32}$/)
      assert.equal(opts.nx, true)
      assert.equal(opts.ex, 45)
      seenKeys.add(key)
      if (options.forbidden) throw new Error("NOPERM secret-should-not-leak")
      if (records.has(key)) return null
      records.set(key, value)
      if (options.lostWrite) throw new Error("network response lost")
      return "OK"
    },
    get: async key => records.get(key) ?? null,
    del: async key => options.cleanupFails ? 0 : records.delete(key) ? 1 : 0,
    eval: async (script, keys, args) => {
      evals++
      assert.equal(keys.length, 1)
      assert.ok(seenKeys.has(keys[0]))
      assert.equal(args[2], "45")
      assert.match(script, /redis.call\('get',KEYS\[1\]\)==ARGV\[1\]/)
      if (options.forbidden) throw new Error("NOPERM secret-should-not-leak")
      if (options.rejectCas) return 0
      if (records.get(keys[0]) !== args[0] && !options.acceptReplay) return 0
      records.set(keys[0], args[1])
      return 1
    },
  }
  return { redis, records, seenKeys, evals: () => evals }
}

test("actual enqueue, claim, finish and stale CAS rejection pass with cleanup", async () => {
  const fake = fakeRedis()
  assert.deepEqual(await probeBuyerLinkRedisWrite({ env: safeEnv(), redis: fake.redis }), {
    ok: true, code: "BUYER_LINK_REDIS_PROBE_PASS",
  })
  assert.equal(fake.evals(), 3)
  assert.equal(fake.seenKeys.size, 1)
  assert.equal(fake.records.size, 0)
})

test("write permission failure is sanitized", async () => {
  const fake = fakeRedis({ forbidden: true })
  const result = await probeBuyerLinkRedisWrite({ env: safeEnv(), redis: fake.redis })
  assert.equal(result.ok, false)
  assert.doesNotMatch(JSON.stringify(result), /secret-should-not-leak/)
})

test("EVAL denial is distinct from SET denial and still deletes the probe", async () => {
  const fake = fakeRedis()
  fake.redis.eval = async () => { throw new Error("NOPERM EVAL secret-should-not-leak") }
  const result = await probeBuyerLinkRedisWrite({ env: safeEnv(), redis: fake.redis })
  assert.deepEqual(result, { ok: false, code: "BUYER_LINK_REDIS_CAS_FORBIDDEN" })
  assert.equal(fake.records.size, 0)
})

test("rejected claim fails closed and cleans up", async () => {
  const fake = fakeRedis({ rejectCas: true })
  assert.equal((await probeBuyerLinkRedisWrite({ env: safeEnv(), redis: fake.redis })).code, "BUYER_LINK_REDIS_CAS_CLAIM_FAILED")
  assert.equal(fake.records.size, 0)
})

test("accepted stale completion is not reported as passing", async () => {
  const fake = fakeRedis({ acceptReplay: true })
  assert.equal((await probeBuyerLinkRedisWrite({ env: safeEnv(), redis: fake.redis })).code, "BUYER_LINK_REDIS_CAS_REPLAY_ACCEPTED")
  assert.equal(fake.records.size, 0)
})

test("cleanup failure overrides success", async () => {
  const fake = fakeRedis({ cleanupFails: true })
  assert.equal((await probeBuyerLinkRedisWrite({ env: safeEnv(), redis: fake.redis })).code, "BUYER_LINK_REDIS_CLEANUP_UNCONFIRMED")
})

test("lost SET response is cleaned up", async () => {
  const fake = fakeRedis({ lostWrite: true })
  assert.equal((await probeBuyerLinkRedisWrite({ env: safeEnv(), redis: fake.redis })).code, "BUYER_LINK_REDIS_TIMEOUT")
  assert.equal(fake.records.size, 0)
})

test("armed switches and wrong datastore never access Redis", async () => {
  const fake = fakeRedis()
  const armed = { ...safeEnv(), AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "true" }
  assert.equal((await probeBuyerLinkRedisWrite({ env: armed, redis: fake.redis })).code, "BUYER_LINK_REDIS_SCOPE_DENIED")
  const wrong = { ...safeEnv(), AMS_STRIPE_PILOT_REDIS_REST_URL: "https://unrelated-preview.upstash.io" }
  assert.equal((await probeBuyerLinkRedisWrite({ env: wrong, redis: fake.redis })).code, "BUYER_LINK_REDIS_STORAGE_UNVERIFIED")
  assert.equal(fake.seenKeys.size, 0)
})
