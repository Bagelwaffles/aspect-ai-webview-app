import assert from "node:assert/strict"
import test from "node:test"
import type { Redis } from "@upstash/redis"
import { claimStripeEvent, completeStripeEvent, releaseStripeEvent } from "../lib/server/entitlements"
import { RedisQuickAuditStore } from "../lib/server/quick-audit-fulfillment"

/**
 * An isolated, deterministic Redis state-machine fixture for exercising the
 * actual claim/complete/release functions. eval() models each Lua script as a
 * single atomic operation; it does NOT substitute for live Redis or Stripe
 * delivery acceptance.
 */
class AtomicRedisFixture {
  private clock = 0
  private entries = new Map<string, { value: string; expiresAt: number }>()

  asRedis(): Redis {
    return this as unknown as Redis
  }

  advance(seconds: number) {
    this.clock += seconds * 1000
  }

  private read(key: string): string | undefined {
    const cell = this.entries.get(key)
    if (cell && cell.expiresAt <= this.clock) {
      this.entries.delete(key)
      return undefined
    }
    return cell?.value
  }

  async eval(script: string, keys: string[], args: string[]): Promise<unknown> {
    assert.equal(keys.length, 1)
    assert.equal(args.length, 1)
    assert.match(script, /redis\.call\('GET', KEYS\[1\]\)/)
    const key = keys[0]
    const token = args[0]
    const current = this.read(key)

    if (script.includes("return {'claimed'}")) {
      assert.match(script, /'processing:' \.\. ARGV\[1\], 'EX', 600/)
      if (current === undefined) {
        this.entries.set(key, { value: "processing:" + token, expiresAt: this.clock + 600_000 })
        return ["claimed"]
      }
      return [current === "done" ? "completed" : "processing"]
    }

    if (script.includes("return {'ownership_lost'}")) {
      assert.match(script, /'done', 'EX', 7776000/)
      if (current === "processing:" + token) {
        this.entries.set(key, { value: "done", expiresAt: this.clock + 7_776_000_000 })
        return ["completed"]
      }
      return [current === "done" ? "completed" : "ownership_lost"]
    }

    if (script.includes("redis.call('DEL', KEYS[1])")) {
      if (current === "processing:" + token) {
        this.entries.delete(key)
        return 1
      }
      return 0
    }

    throw new Error("Unexpected Redis script")
  }
}

test("concurrent claims of one event have only one winner", async () => {
  const redis = new AtomicRedisFixture().asRedis()
  const claims = await Promise.all(
    Array.from({ length: 24 }, () => claimStripeEvent("evt_concurrent_fixture", redis)),
  )
  const winners = claims.filter((claim) => claim.state === "claimed")
  assert.equal(winners.length, 1)
  assert.equal(claims.filter((claim) => claim.state === "processing").length, 23)
  const winner = winners[0]
  if (winner.state !== "claimed") throw new Error("Expected one claimed event")
  await completeStripeEvent("evt_concurrent_fixture", winner.token, redis)
  assert.deepEqual(await claimStripeEvent("evt_concurrent_fixture", redis), { state: "completed" })
})

test("completed events are deduplicated until the 90-day marker expires", async () => {
  const fixture = new AtomicRedisFixture()
  const redis = fixture.asRedis()
  const first = await claimStripeEvent("evt_completed_fixture", redis)
  assert.equal(first.state, "claimed")
  if (first.state !== "claimed") throw new Error("Expected claim token")
  await completeStripeEvent("evt_completed_fixture", first.token, redis)
  assert.deepEqual(await claimStripeEvent("evt_completed_fixture", redis), { state: "completed" })
  fixture.advance(7_775_999)
  assert.deepEqual(await claimStripeEvent("evt_completed_fixture", redis), { state: "completed" })
  fixture.advance(2)
  assert.equal((await claimStripeEvent("evt_completed_fixture", redis)).state, "claimed")
})

test("release and completion require the current claim owner", async () => {
  const redis = new AtomicRedisFixture().asRedis()
  const first = await claimStripeEvent("evt_owner_fixture", redis)
  if (first.state !== "claimed") throw new Error("Expected claim token")

  await assert.rejects(
    completeStripeEvent("evt_owner_fixture", "not-the-owner", redis),
    /STRIPE_EVENT_CLAIM_OWNERSHIP_LOST/,
  )
  await releaseStripeEvent("evt_owner_fixture", "not-the-owner", redis)
  assert.deepEqual(await claimStripeEvent("evt_owner_fixture", redis), { state: "processing" })

  await releaseStripeEvent("evt_owner_fixture", first.token, redis)
  const retry = await claimStripeEvent("evt_owner_fixture", redis)
  assert.equal(retry.state, "claimed")
})

test("expired processing claims can be reclaimed but stale owners cannot finish", async () => {
  const fixture = new AtomicRedisFixture()
  const redis = fixture.asRedis()
  const first = await claimStripeEvent("evt_expiry_fixture", redis)
  if (first.state !== "claimed") throw new Error("Expected claim token")
  fixture.advance(599)
  assert.deepEqual(await claimStripeEvent("evt_expiry_fixture", redis), { state: "processing" })
  fixture.advance(2)
  const retry = await claimStripeEvent("evt_expiry_fixture", redis)
  if (retry.state !== "claimed") throw new Error("Expected fresh claim token")
  assert.notEqual(retry.token, first.token)
  await assert.rejects(
    completeStripeEvent("evt_expiry_fixture", first.token, redis),
    /STRIPE_EVENT_CLAIM_OWNERSHIP_LOST/,
  )
  await releaseStripeEvent("evt_expiry_fixture", first.token, redis)
  assert.deepEqual(await claimStripeEvent("evt_expiry_fixture", redis), { state: "processing" })
  await completeStripeEvent("evt_expiry_fixture", retry.token, redis)
  assert.deepEqual(await claimStripeEvent("evt_expiry_fixture", redis), { state: "completed" })
})

test("isolated Redis stores cannot claim or complete each other's event state", async () => {
  const a = new AtomicRedisFixture().asRedis()
  const b = new AtomicRedisFixture().asRedis()
  const claimA = await claimStripeEvent("evt_isolation_fixture", a)
  const claimB = await claimStripeEvent("evt_isolation_fixture", b)
  assert.equal(claimA.state, "claimed")
  assert.equal(claimB.state, "claimed")
  if (claimA.state !== "claimed" || claimB.state !== "claimed") throw new Error("Expected both claims")
  await completeStripeEvent("evt_isolation_fixture", claimA.token, a)
  assert.deepEqual(await claimStripeEvent("evt_isolation_fixture", a), { state: "completed" })
  assert.deepEqual(await claimStripeEvent("evt_isolation_fixture", b), { state: "processing" })
})

test("abandoned Quick Audit reservation is recoverable after ten minutes without losing completed deduplication", async () => {
  let elapsedSeconds = 0
  const records = new Map<string, { value: string; expiresAt: number }>()
  const get = (key: string): string | null => {
    const record = records.get(key)
    if (record && record.expiresAt <= elapsedSeconds) {
      records.delete(key)
      return null
    }
    return record?.value ?? null
  }

  // A minimal atomic Redis-EVAL fixture with a controllable clock.
  // It exercises the exact reserve/complete/release calls without any external credentials.
  const redis = {
    async eval(script: string, keys: string[], args: unknown[]): Promise<unknown> {
      const current = get(keys[0])
      if (script.includes("if existing then return existing end")) {
        if (current !== null) return current
        const ttl = Number(args[1])
        assert.equal(ttl, 600, "unfinished reservations must not block retries for 90 days")
        records.set(keys[0], { value: String(args[0]), expiresAt: elapsedSeconds + ttl })
        return ""
      }
      if (script.includes("local decoded = cjson.decode(current)")) {
        if (current === null) return 0
        if (JSON.parse(current).token !== args[0]) return -1
        const ttl = Number(args[2])
        assert.equal(ttl, 7_776_000, "completed results retain the full 90 days")
        records.set(keys[0], { value: String(args[1]), expiresAt: elapsedSeconds + ttl })
        for (const key of keys.slice(1)) {
          records.set(key, { value: String(args[3]), expiresAt: elapsedSeconds + ttl })
        }
        return 1
      }
      if (script.includes("local v=redis.call('GET',KEYS[1])")) {
        if (current === null) return 0
        const record = JSON.parse(current)
        if (record.token === args[0] && record.status === "processing") {
          records.delete(keys[0])
          return 1
        }
        return 0
      }
      throw new Error("Unexpected Redis EVAL script")
    },
  }
  const store = new RedisQuickAuditStore(redis)
  const input = {
    checkoutSessionId: "cs_test_crash_recovery",
    stripeEventId: "evt_crash_recovery",
    requestId: "request_crash_recovery",
  }
  const first = await store.reserve(input)
  assert.equal(first.state, "reserved")
  if (first.state !== "reserved") throw new Error("Expected first reservation")
  elapsedSeconds = 599
  assert.equal((await store.reserve(input)).state, "processing")

  // Simulate an abrupt serverless termination (no release call).
  elapsedSeconds = 601
  const second = await store.reserve(input)
  assert.equal(second.state, "reserved")
  if (second.state !== "reserved") throw new Error("Expected expired reservation to be reclaimed")
  assert.notEqual(second.token, first.token)

  const result = {
    status: "completed" as const,
    ...input,
    n8nAuditId: "audit_crash_recovery",
    completedAt: "2026-10-27T00:00:00.000Z",
  }
  await assert.rejects(
    store.complete({ ...result, token: first.token }),
    /QUICK_AUDIT_CLAIM_LOST/,
  )
  await store.release({ checkoutSessionId: input.checkoutSessionId, token: first.token })
  assert.equal((await store.reserve(input)).state, "processing")

  await store.complete({ ...result, token: second.token })
  const duplicate = await store.reserve(input)
  assert.equal(duplicate.state, "duplicate")
  if (duplicate.state !== "duplicate") throw new Error("Expected durable completed result")
  assert.equal(duplicate.record.n8nAuditId, result.n8nAuditId)

  elapsedSeconds += 7_775_999
  assert.equal((await store.reserve(input)).state, "duplicate")
  elapsedSeconds += 2
  assert.equal((await store.reserve(input)).state, "reserved")
})
