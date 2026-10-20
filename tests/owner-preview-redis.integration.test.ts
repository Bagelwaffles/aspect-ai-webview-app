import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import IORedis from "ioredis"
import { adaptOwnerValkey, aivenPreviewOptions } from "../lib/server/owner-preview-redis"

// Opt in only against the new Aiven endpoint. No Google APIs or real grants.
test("Aiven TLS: atomic claims, fencing, expiry and cross-connection persistence", { skip: process.env.AMS_AIVEN_SYNTHETIC_TEST !== "true" }, async () => {
  const options = aivenPreviewOptions(process.env)
  const a = new IORedis(options), b = new IORedis(options)
  const first = adaptOwnerValkey(a), second = adaptOwnerValkey(b)
  const root = `ams:synthetic:${randomUUID()}:`
  const keys = [root + "lock", root + "state", root + "oauth", root + "count", root + "expiring"]
  try {
    const claims = await Promise.all([first.set(keys[0], "a", { nx: true, ex: 10 }), second.set(keys[0], "b", { nx: true, ex: 10 })])
    assert.equal(claims.filter(x => x === "OK").length, 1)
    const lease = claims[0] === "OK" ? "a" : "b"
    const fence = "if redis.call('get',KEYS[1]) ~= ARGV[1] then return 0 end redis.call('set',KEYS[2],ARGV[2]); return 1"
    assert.equal(await first.eval(fence, keys.slice(0, 2), ["wrong", "bad"]), 0)
    const state = { enabled: false, history: [{ status: "succeeded", checkpoint: 123 }], findings: ["synthetic"] }
    assert.equal(await first.eval(fence, keys.slice(0, 2), [lease, JSON.stringify(state)]), 1)
    assert.deepEqual(await second.get(keys[1]), state)
    const release = "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) end return 0"
    assert.equal(await first.eval(release, [keys[0]], ["wrong"]), 0)
    assert.equal(await first.eval(release, [keys[0]], [lease]), 1)
    await first.set(keys[2], "synthetic-state", { ex: 10 })
    const consume = "local v=redis.call('get',KEYS[1]); if v then redis.call('del',KEYS[1]) end return v"
    assert.equal(await second.eval(consume, [keys[2]], []), "synthetic-state")
    assert.equal(await first.eval(consume, [keys[2]], []), null)
    const limit = "local n=tonumber(redis.call('get',KEYS[1]) or '0'); if n>=tonumber(ARGV[1]) then return 0 end redis.call('incr',KEYS[1]); redis.call('expire',KEYS[1],ARGV[2]); return 1"
    assert.equal(await first.eval(limit, [keys[3]], ["1", "10"]), 1)
    assert.equal(await second.eval(limit, [keys[3]], ["1", "10"]), 0)
    await first.set(keys[4], "temporary", { ex: 1 })
    await new Promise(resolve => setTimeout(resolve, 1100))
    assert.equal(await second.get(keys[4]), null)
  } finally {
    // Only this test's randomly generated keys; never scan/delete app records.
    if (a.status === "ready") await a.del(...keys)
    a.disconnect(); b.disconnect()
  }
})
