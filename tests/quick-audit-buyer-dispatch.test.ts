import assert from "node:assert/strict"
import test from "node:test"

import type Stripe from "stripe"
import { buildNativeQuickAuditResult } from "../lib/server/quick-audit-native"
import { dispatchApprovedQuickAuditOwnerPreview } from "../lib/server/quick-audit-buyer-dispatch"

const requestId = "quick-audit-request-dispatch"
const sessionId = "cs_test_dispatchbuyer123"
const priceId = "price_pilotAudit123"
const owner = "buyer@example.com"
const from = "kimberley@aspectmarketingsolutions.app"
const signingSecret = "synthetic-owner-preview-report-secret-with-enough-length"
const now = Date.UTC(2026, 9, 29, 12)

const report = buildNativeQuickAuditResult({
  businessName: "Fictional Sample",
  websiteUrl: "https://example.com",
  industry: "Services",
  goals: "Get leads",
  notes: "",
  requestId,
  evidence: { hasPrimaryCta: false },
})

type RecordState = "queued" | "sending" | "submitted" | "delivered" | "failed" | "uncertain"
type FakeRecord = {
  auditId: string
  requestId: string
  checkoutSessionId: string
  recipient: string
  state: RecordState
  createdAt: string
  attemptId?: string
  providerMessageId?: string
  lastErrorCode?: string
}

function fixture(options: {
  paid?: boolean
  price?: string
  recipient?: string
  stripeEmail?: string
  proofAuditId?: string
  sendFailure?: boolean
  senderVerified?: boolean
} = {}) {
  let record: FakeRecord = {
    auditId: report.auditId,
    requestId,
    checkoutSessionId: sessionId,
    recipient: options.recipient ?? owner,
    state: "queued",
    createdAt: new Date(now).toISOString(),
  }
  let claims = 0
  let sends = 0
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "feat/quick-audit-executive-summary-20261029",
    VERCEL_URL: "aspect-ai-overlord-synthetic-kimberleyaversbiz-4131s-projects.vercel.app",
    AMS_QUICK_AUDIT_BUYER_DISPATCH_ENABLED: "true",
    AMS_QUICK_AUDIT_REPORT_ACCESS_REQUIRED: "true",
    AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "true",
    AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL: owner,
    AMS_STRIPE_PILOT_PRICE_ID: priceId,
    AMS_QUICK_AUDIT_REPORT_ACCESS_SECRET: signingSecret,
  }
  const outbox = {
    read: async (_id: string) => ({ ...record }),
    claim: async (_id: string, flags: { enabled: boolean; ownerOnly: boolean; ownerEmail: string }) => {
      if (!flags.enabled || !flags.ownerOnly || flags.ownerEmail !== owner || record.state !== "queued") return null
      claims += 1
      record = { ...record, state: "sending", attemptId: "claim-unique" }
      return { ...record }
    },
    finish: async (claim: FakeRecord, outcome: {
      state: "submitted" | "delivered" | "failed" | "uncertain"
      providerMessageId?: string
      code?: string
    }) => {
      if (record.state !== "sending" || claim.attemptId !== record.attemptId) return false
      record = { ...record, state: outcome.state, providerMessageId: outcome.providerMessageId, lastErrorCode: outcome.code }
      return true
    },
  }
  const proof = {
    readSession: async (_id: string) => ({
      status: "completed" as const,
      checkoutSessionId: sessionId,
      requestId,
      n8nAuditId: options.proofAuditId ?? report.auditId,
    }),
  }
  const reports = { getByRequestId: async (_id: string) => report }
  const stripe = {
    retrieveCheckoutSession: async (_id: string) => ({
      id: sessionId,
      object: "checkout.session",
      livemode: false,
      mode: "payment",
      status: "complete",
      payment_status: options.paid === false ? "unpaid" : "paid",
      amount_total: 4900,
      currency: "usd",
      metadata: { ams_offer: "quick-marketing-audit", ams_request_id: requestId },
      customer_details: { email: options.stripeEmail ?? owner },
    }) as unknown as Stripe.Checkout.Session,
    listLineItems: async (_id: string) => ({
      object: "list",
      data: [{ id: "li_test", object: "item", quantity: 1, price: { id: options.price ?? priceId } as Stripe.Price } as Stripe.LineItem],
      has_more: false,
      url: "/v1/checkout/sessions/mock/line_items",
    }) as Stripe.ApiList<Stripe.LineItem>,
  }
  const sender = {
    inspectSender: async (_address: string) => ({
      address: from,
      displayName: "Aspect Marketing Solutions",
      replyToAddress: from,
      verificationStatus: options.senderVerified === false ? "pending" as const : "accepted" as const,
    }),
    send: async (input: { recipient: string; subject: string; plainText: string }) => {
      sends += 1
      assert.equal(input.recipient, owner)
      assert.match(input.subject, /Quick Marketing Audit/)
      assert.match(input.plainText, /#report_token=/)
      if (options.sendFailure) throw new Error("simulated send timeout")
      return { messageId: "synthetic-message-001", fromAddress: from }
    },
  }
  return {
    input: { requestId, env, outbox, proof, reports, stripe, sender, now },
    counters: () => ({ claims, sends, state: record.state, providerMessageId: record.providerMessageId }),
  }
}

test("approved Preview dispatch submits exactly one buyer-bound report link", async () => {
  const f = fixture()
  assert.equal(await dispatchApprovedQuickAuditOwnerPreview(f.input), "submitted")
  assert.deepEqual(f.counters(), { claims: 1, sends: 1, state: "submitted", providerMessageId: "synthetic-message-001" })
  assert.equal(await dispatchApprovedQuickAuditOwnerPreview(f.input), "duplicate")
  assert.equal(f.counters().sends, 1)
})

test("disabled by default and never dispatches from production", async () => {
  for (const patch of [
    { AMS_QUICK_AUDIT_BUYER_DISPATCH_ENABLED: undefined },
    { AMS_QUICK_AUDIT_REPORT_ACCESS_REQUIRED: undefined },
    { AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: undefined },
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { VERCEL_URL: "aspect-ai-overlord-synthetic-kimberleyaversbiz-4131s-projects.vercel.app", VERCEL_ENV: "production" },
  ]) {
    const f = fixture()
    Object.assign(f.input.env, patch)
    assert.equal(await dispatchApprovedQuickAuditOwnerPreview(f.input), "disabled")
    assert.equal(f.counters().claims, 0)
    assert.equal(f.counters().sends, 0)
  }
})

test("never claims or sends without durable proof, verified Stripe price and exact recipient", async () => {
  for (const o of [
    { proofAuditId: "audit_wrong" },
    { paid: false },
    { price: "price_other49" },
    { recipient: "wrong@example.com" },
    { stripeEmail: "wrong@example.com" },
    { senderVerified: false },
  ]) {
    const f = fixture(o)
    assert.equal(await dispatchApprovedQuickAuditOwnerPreview(f.input), "held")
    assert.equal(f.counters().claims, 0)
    assert.equal(f.counters().sends, 0)
  }
})

test("ambiguous send outcome stays uncertain and is never automatically replayed", async () => {
  const f = fixture({ sendFailure: true })
  assert.equal(await dispatchApprovedQuickAuditOwnerPreview(f.input), "uncertain")
  assert.equal(f.counters().state, "uncertain")
  assert.equal(await dispatchApprovedQuickAuditOwnerPreview(f.input), "duplicate")
  assert.equal(f.counters().claims, 1)
  assert.equal(f.counters().sends, 1)
})

test("Preview delivery refuses missing or untrusted Vercel URL before outbox claim", async () => {
  for (const hostname of [
    undefined,
    "www.aspectmarketingsolutions.app",
    "aspect-ai-overlord-synthetic-kimberleyaversbiz-4131s-projects.vercel.app.evil.example",
  ]) {
    const f = fixture()
    f.input.env.VERCEL_URL = hostname
    assert.equal(await dispatchApprovedQuickAuditOwnerPreview(f.input), "held")
    assert.equal(f.counters().claims, 0)
    assert.equal(f.counters().sends, 0)
  }
})
