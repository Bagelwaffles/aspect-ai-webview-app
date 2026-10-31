import assert from "node:assert/strict"
import test from "node:test"

import { BUYER_LINK_DELIVERY_PREFIX, QuickAuditDeliveryOutbox } from "../lib/server/quick-audit-delivery-outbox"

const requestId = "quick-audit-existing-paid-order-001"
const originalPrefix = "ams:quick-audit:delivery:"
const recipient = "buyer@example.com"
const order = {
  auditId: "audit_test_buyer_outbox",
  requestId,
  checkoutSessionId: "cs_test_ownerAudit1234",
  recipient,
  paidAndPersisted: true,
}
const flags = { enabled: true, ownerOnly: true, ownerEmail: recipient }

function memoryRedis() {
  const data = new Map<string, string>()
  return {
    data,
    async get(key: string) { return data.has(key) ? data.get(key)! : null },
    async set(key: string, value: string, opts: { nx: true; ex: number }) {
      assert.equal(opts.nx, true)
      if (data.has(key)) return null
      data.set(key, value)
      return "OK"
    },
    async eval(_script: string, keys: string[], args: string[]) {
      if (data.get(keys[0]) !== args[0]) return 0
      data.set(keys[0], args[1])
      return 1
    },
  }
}

test("buyer link uses separate Redis CAS key and never resets submitted original email", async () => {
  const redis = memoryRedis()
  const original = new QuickAuditDeliveryOutbox(redis)
  const buyer = new QuickAuditDeliveryOutbox(redis, BUYER_LINK_DELIVERY_PREFIX)
  await original.enqueue(order)
  const first = await original.claim(requestId, flags)
  assert.ok(first)
  assert.equal(await original.finish(first, { state: "submitted", providerMessageId: "old-provider-receipt" }), true)
  const preserved = await original.read(requestId)
  assert.equal(preserved?.state, "submitted")

  const queued = await buyer.enqueue(order)
  assert.equal(queued.state, "queued")
  assert.equal(redis.data.size, 2)
  assert.ok(redis.data.has(originalPrefix + requestId))
  assert.ok(redis.data.has(BUYER_LINK_DELIVERY_PREFIX + requestId))
  const claim = await buyer.claim(requestId, flags)
  assert.ok(claim)
  assert.equal(await buyer.claim(requestId, flags), null)
  assert.equal(await buyer.finish(claim, { state: "submitted", providerMessageId: "buyer-link-receipt" }), true)
  assert.equal((await buyer.enqueue(order)).state, "submitted")
  assert.equal(await buyer.claim(requestId, flags), null)
  assert.deepEqual(await original.read(requestId), preserved)
})

test("ambiguous buyer-link send is held and original receipt remains untouched", async () => {
  const redis = memoryRedis()
  const original = new QuickAuditDeliveryOutbox(redis)
  const buyer = new QuickAuditDeliveryOutbox(redis, BUYER_LINK_DELIVERY_PREFIX)
  await original.enqueue(order)
  const first = await original.claim(requestId, flags)
  assert.ok(first)
  await original.finish(first, { state: "submitted", providerMessageId: "old-provider-receipt" })
  await buyer.enqueue(order)
  const buyerClaim = await buyer.claim(requestId, flags)
  assert.ok(buyerClaim)
  await buyer.finish(buyerClaim, { state: "uncertain", code: "SEND_OUTCOME_UNKNOWN" })
  assert.equal(await buyer.claim(requestId, flags), null)
  assert.equal((await buyer.enqueue(order)).state, "uncertain")
  assert.equal((await original.read(requestId))?.state, "submitted")
})

test("unverified proof and mismatched queue are rejected without touching existing order", async () => {
  const redis = memoryRedis()
  const original = new QuickAuditDeliveryOutbox(redis)
  const buyer = new QuickAuditDeliveryOutbox(redis, BUYER_LINK_DELIVERY_PREFIX)
  await original.enqueue(order)
  await assert.rejects(buyer.enqueue({ ...order, paidAndPersisted: false }), /NOT_VERIFIED/)
  assert.equal(await buyer.read(requestId), null)
  await buyer.enqueue(order)
  await assert.rejects(
    buyer.enqueue({ ...order, recipient: "another@example.com" }),
    /CONFLICT/,
  )
  assert.equal((await original.read(requestId))?.state, "queued")
  assert.equal(redis.data.size, 2)
})
