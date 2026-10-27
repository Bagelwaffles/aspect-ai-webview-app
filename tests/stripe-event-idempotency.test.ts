import assert from "node:assert/strict"
import test from "node:test"
import type { Redis } from "@upstash/redis"
import { claimStripeEvent, completeStripeEvent, releaseStripeEvent } from "../lib/server/entitlements"
import { QuickAuditFulfillmentError, RedisQuickAuditStore } from "../lib/server/quick-audit-fulfillment"
import { createQuickAuditWebhookHandler } from "../lib/server/quick-audit-webhook"
import { NextRequest } from "next/server"
import Stripe from "stripe"
import type { StripeEventClaim } from "../lib/server/entitlements"
import type { QuickAuditRecord, QuickAuditStore } from "../lib/server/quick-audit-fulfillment"

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
    (error: unknown) => error instanceof QuickAuditFulfillmentError && error.code === "QUICK_AUDIT_CLAIM_LOST",
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


test("signed HTTP webhook replay does not generate a second Quick Audit", async () => {
  // Synthetic credentials and mocked Stripe requests; no genuine Stripe delivery.
  const secret = "whsec_synthetic_http_replay_fixture"
  const priceId = "price_synthetic_replay_fixture"
  const stripe = new Stripe("sk_test_synthetic_http_replay_fixture")
  const checkout = {
    id: "cs_test_signed_http_replay_fixture",
    object: "checkout.session",
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    livemode: false,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    metadata: {
      ams_offer: "quick-marketing-audit",
      ams_request_id: "request_signed_http_replay_fixture",
      ams_business_name: "Replay Fixture Business",
      ams_website_url: "https://example.com",
      ams_industry: "Services",
      ams_goals: "Improve leads",
    },
  } as Stripe.Checkout.Session
  const sessions = stripe.checkout.sessions as unknown as {
    retrieve: (id: string) => Promise<Stripe.Checkout.Session>
    listLineItems: (id: string) => Promise<Stripe.ApiList<Stripe.LineItem>>
  }
  sessions.retrieve = async () => checkout
  sessions.listLineItems = async () => ({
    object: "list", data: [{ quantity: 1, price: { id: priceId } }],
    has_more: false, url: "/v1/checkout/sessions/fixture/line_items",
  }) as Stripe.ApiList<Stripe.LineItem>

  const events = new Map<string, "processing" | "completed">()
  const records = new Map<string, QuickAuditRecord | { status: "processing"; requestId: string; token: string }>()
  let audits = 0
  let saved = 0
  const store: QuickAuditStore = {
    async reserve(input) {
      const value = records.get(input.checkoutSessionId)
      if (value?.status === "completed") return { state: "duplicate" as const, record: value }
      if (value) return { state: "processing" as const }
      records.set(input.checkoutSessionId, {
        status: "processing", requestId: input.requestId, token: "session_claim_fixture",
      })
      return { state: "reserved" as const, token: "session_claim_fixture" }
    },
    async complete(input) {
      const { token: _token, ...record } = input
      records.set(input.checkoutSessionId, record)
      saved++
    },
    async release(input) {
      const value = records.get(input.checkoutSessionId)
      if (value?.status === "processing" && value.token === input.token) {
        records.delete(input.checkoutSessionId)
      }
    },
  }
  const handler = createQuickAuditWebhookHandler({
    env: {
      NODE_ENV: "test",
      AMS_STRIPE_WEBHOOK_MODE: "test",
      AMS_STRIPE_QUICK_AUDIT_SECRET_KEY: "sk_test_synthetic_http_replay_fixture",
      AMS_STRIPE_QUICK_AUDIT_WEBHOOK_SECRET: secret,
      AMS_STRIPE_QUICK_AUDIT_PRICE_ID: priceId,
      AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED: "false",
      AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "false",
    },
    createStripe: () => stripe,
    claimEvent: async (id): Promise<StripeEventClaim> => {
      const status = events.get(id)
      if (status) return { state: status }
      events.set(id, "processing")
      return { state: "claimed", token: "event_claim_fixture" }
    },
    completeEvent: async (id) => { events.set(id, "completed") },
    releaseEvent: async (id) => { events.delete(id) },
    store,
    evidenceCollector: async () => ({ hasPrimaryCta: true }),
    auditGateway: {
      run: async () => {
        audits++
        return { auditId: "audit_signed_http_replay_fixture" }
      },
    },
  })
  const send = async (id: string, badSignature = false) => {
    const payload = JSON.stringify({
      id, object: "event", type: "checkout.session.completed", livemode: false,
      data: { object: { id: checkout.id, mode: "payment", metadata: checkout.metadata } },
    })
    const signature = badSignature ? "invalid" : stripe.webhooks.generateTestHeaderString({ payload, secret })
    const response = await handler(new NextRequest("https://example.test/api/webhooks/stripe", {
      method: "POST", headers: { "stripe-signature": signature }, body: payload,
    }))
    return { status: response?.status ?? null, body: response ? await response.json() : null }
  }
  const malformed = await send("evt_signed_replay_fixture", true)
  assert.equal(malformed.status, null)
  assert.equal(audits, 0)

  const first = await send("evt_signed_replay_fixture")
  assert.equal(first.status, 200)
  assert.equal(first.body?.applied, true)

  const second = await send("evt_signed_replay_fixture")
  assert.equal(second.status, 200)
  assert.equal(second.body?.duplicate, true)
  assert.equal(second.body?.processed, false)

  const third = await send("evt_signed_replay_fixture_other")
  assert.equal(third.status, 200)
  assert.equal(third.body?.duplicate, true)
  assert.equal(third.body?.applied, false)
  assert.equal(audits, 1)
  assert.equal(saved, 1)
})
