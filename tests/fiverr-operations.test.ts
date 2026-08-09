import assert from "node:assert/strict"
import test from "node:test"

import { normalizeFiverrNotification } from "../lib/server/fiverr-bridge"
import { fiverrOperationRecordFromEvent } from "../lib/server/fiverr-operations"

test("Fiverr operation persistence keeps only operator-safe fields", () => {
  const event = normalizeFiverrNotification({
    message_id: "msg-operator-1",
    thread_id: "thread-1",
    from: "Fiverr <notify@fiverr.com>",
    subject: "You received a new order",
    snippet: "buyer_demo placed an order",
    text: "buyer_demo placed an order for Quick Marketing Audit. secret=do-not-store",
    received_at: "2026-08-09T14:00:00.000Z",
    labels: ["Fiverr"],
  })

  const record = fiverrOperationRecordFromEvent(event, "2026-08-09T14:01:00.000Z")

  assert.equal(record.event_id, event.event_id)
  assert.equal(record.event_type, "new_order")
  assert.equal(record.recommended_action, "prepare_fulfillment")
  assert.equal(record.buyer_username, "buyer_demo")
  assert.equal(record.quick_audit_match, true)
  assert.equal(record.human_approval_required, true)

  const persisted = record as unknown as Record<string, unknown>
  assert.equal("safe_context" in persisted, false)
  assert.equal("sender_address" in persisted, false)
  assert.equal("sender_domain" in persisted, false)
  assert.equal("fulfillment" in persisted, false)
  assert.equal(JSON.stringify(record).includes("do-not-store"), false)
})
