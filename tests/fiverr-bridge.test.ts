import assert from "node:assert/strict"
import test from "node:test"

import {
  buildFiverrOperatorBrief,
  isFiverrSender,
  normalizeFiverrNotification,
} from "../lib/server/fiverr-bridge"

test("allows Fiverr sender domains and rejects lookalikes", () => {
  assert.equal(isFiverrSender("Fiverr <notify@fiverr.com>"), true)
  assert.equal(isFiverrSender("Fiverr <notify@e.fiverr.com>"), true)
  assert.equal(isFiverrSender("notify@alerts.e.fiverr.com"), true)
  assert.equal(isFiverrSender("notify@fiverr.com.attacker.example"), false)
  assert.equal(isFiverrSender("someone@example.com"), false)
})

test("normalizes a Quick Marketing Audit order with human approval locked on", () => {
  const event = normalizeFiverrNotification({
    message_id: "gmail-123",
    thread_id: "thread-123",
    from: "Fiverr <orders@e.fiverr.com>",
    subject: "You have a new order",
    snippet: "buyer_77 placed an order for your Quick Marketing Audit",
    text: "Order #FO123456789. Quick Marketing Audit with a 7-day action plan. Delivery due in 2 days.",
    received_at: "2026-08-08T04:00:00.000Z",
    labels: ["INBOX"],
  })

  assert.equal(event.event_type, "new_order")
  assert.equal(event.recommended_action, "prepare_fulfillment")
  assert.equal(event.priority, "high")
  assert.equal(event.order_reference, "FO123456789")
  assert.equal(event.buyer_username, "buyer_77")
  assert.equal(event.quick_audit_match, true)
  assert.equal(event.service_slug, "quick-marketing-audit")
  assert.equal(event.deadline_at, "2026-08-10T04:00:00.000Z")
  assert.equal(event.human_approval_required, true)
  assert.equal(event.fiverr_action_allowed, false)
  assert.equal(event.external_payment_allowed, false)
  assert.deepEqual(event.fulfillment?.deliverables, [
    "5 marketing problems",
    "5 specific fixes",
    "improved headline",
    "improved offer",
    "1 ready-to-use promotional post",
    "7-day action plan",
  ])
})

test("revision requests are high priority and never auto-send", () => {
  const event = normalizeFiverrNotification({
    message_id: "gmail-revision",
    from: "notifications@fiverr.com",
    subject: "Revision requested",
    snippet: "buyer99 requested a revision",
    text: "The buyer requested a revision for order #FO987654321.",
  })
  const brief = buildFiverrOperatorBrief(event)

  assert.equal(event.event_type, "revision_requested")
  assert.equal(event.recommended_action, "prepare_revision")
  assert.equal(event.priority, "high")
  assert.equal(brief.human_approval_required, true)
  assert.ok(brief.prohibited_actions.includes("do not submit deliveries automatically"))
})

test("rejects non-Fiverr senders even when the message says Fiverr", () => {
  assert.throws(
    () =>
      normalizeFiverrNotification({
        message_id: "fake-1",
        from: "scammer@example.com",
        subject: "Fiverr new order",
        text: "You have a Fiverr order",
      }),
    /FIVERR_SENDER_NOT_ALLOWED/,
  )
})

test("redacts obvious secrets from context", () => {
  const event = normalizeFiverrNotification({
    message_id: "gmail-redact",
    from: "notify@fiverr.com",
    subject: "New message",
    snippet: "A buyer sent you a message",
    text: "password: example-password-value token=example-token-value Authorization: Bearer example.bearer.value",
  })

  assert.equal(event.safe_context.includes("example-password-value"), false)
  assert.equal(event.safe_context.includes("example-token-value"), false)
  assert.equal(event.safe_context.includes("example.bearer.value"), false)
  assert.equal(event.safe_context.includes("[REDACTED]"), true)
})

test("unknown Fiverr notifications fail closed to manual review", () => {
  const event = normalizeFiverrNotification({
    message_id: "gmail-unknown",
    from: "news@e.fiverr.com",
    subject: "Account update",
    text: "There is an update available in your Fiverr account.",
  })

  assert.equal(event.event_type, "needs_review")
  assert.equal(event.recommended_action, "manual_review")
  assert.equal(event.human_approval_required, true)
  assert.equal(event.fiverr_action_allowed, false)
})
