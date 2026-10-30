import assert from "node:assert/strict"
import test from "node:test"

import type Stripe from "stripe"

import { buildNativeQuickAuditResult } from "../lib/server/quick-audit-native"
import { prepareVerifiedBuyerQuickAuditEmail } from "../lib/server/quick-audit-buyer-delivery"
import { verifyBuyerReportAccessToken } from "../lib/server/quick-audit-report-access"

const signingSecret = "test-only-buyer-delivery-secret-with-at-least-32-characters"
const now = Date.UTC(2026, 9, 29, 12, 0, 0)
const sessionId = "cs_test_buyerReceipt1234"
const priceId = "price_verifiedAudit123"
const requestId = "quick-audit-request-proof"
const report = buildNativeQuickAuditResult({
  businessName: "Fictional Services",
  websiteUrl: "https://example.com",
  industry: "Services",
  goals: "Improve inquiries",
  notes: "",
  requestId,
  evidence: { hasPrimaryCta: false },
})
function paidSession(overrides: Partial<Stripe.Checkout.Session> = {}) {
  return {
    id: sessionId,
    object: "checkout.session",
    livemode: false,
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    amount_total: 4900,
    currency: "usd",
    metadata: { ams_offer: "quick-marketing-audit", ams_request_id: requestId },
    customer_details: { email: "buyer@example.com" },
    ...overrides,
  } as Stripe.Checkout.Session
}
function fixture(input: {
  session?: Stripe.Checkout.Session
  price?: string
  hasMore?: boolean
  count?: number
} = {}) {
  let retrieved = 0
  const stripe = {
    retrieveCheckoutSession: async () => { retrieved += 1; return input.session ?? paidSession() },
    listLineItems: async () => ({
      object: "list",
      data: Array.from({ length: input.count ?? 1 }, (_, index) => ({
        id: "li_test_" + index,
        object: "item",
        quantity: 1,
        price: { id: input.price ?? priceId },
      } as Stripe.LineItem)),
      has_more: input.hasMore ?? false,
      url: "/v1/checkout/sessions/" + sessionId + "/line_items",
    } as Stripe.ApiList<Stripe.LineItem>),
  }
  return { stripe, calls: () => retrieved }
}
const input = (changes: Record<string, unknown> = {}) => ({
  sessionId,
  expectedPriceId: priceId,
  expectedLivemode: false,
  report,
  signingSecret,
  now,
  ...fixture(),
  ...changes,
})

test("prepares ONLY a verified paid audit email addressed to exact Stripe buyer", async () => {
  const result = await prepareVerifiedBuyerQuickAuditEmail(input())
  assert.equal(result.recipient, "buyer@example.com")
  assert.equal(result.auditId, report.auditId)
  const url = new URL(result.reportUrl)
  assert.equal(url.origin, "https://www.aspectmarketingsolutions.app")
  assert.equal(url.pathname, "/quick-marketing-audit/thanks")
  assert.equal(url.searchParams.get("session_id"), sessionId)
  assert.equal(url.searchParams.has("report_token"), false)
  const token = new URLSearchParams(url.hash.slice(1)).get("report_token")!
  assert.equal(verifyBuyerReportAccessToken(token, {
    checkoutSessionId: sessionId,
    requestId,
    buyerEmail: result.recipient,
  }, signingSecret, now), true)
  assert.equal(result.plainText.includes(result.reportUrl), true)
  assert.equal(result.plainText.includes(report.findings[0].observation), false)
})

test("never prepares mail for an unpaid, wrong-account or incorrect offer", async () => {
  for (const session of [
    paidSession({ payment_status: "unpaid" }),
    paidSession({ livemode: true }),
    paidSession({ amount_total: 100 }),
    paidSession({ metadata: { ams_offer: "credit-topup", ams_request_id: requestId } }),
    paidSession({ status: "open" }),
    paidSession({ currency: "eur" }),
  ]) {
    await assert.rejects(prepareVerifiedBuyerQuickAuditEmail(input({
      stripe: fixture({ session }).stripe,
    })), /AUDIT_BUYER_DELIVERY_PAYMENT_UNVERIFIED/)
  }
})

test("wrong Stripe price, duplicate line items, and pagination fail closed", async () => {
  for (const options of [{ price: "price_wrong123" }, { count: 2 }, { hasMore: true }]) {
    await assert.rejects(prepareVerifiedBuyerQuickAuditEmail(input({
      stripe: fixture(options).stripe,
    })), /AUDIT_BUYER_DELIVERY_PRICE_MISMATCH/)
  }
})

test("requires one unambiguous buyer email and the exact persisted report", async () => {
  await assert.rejects(prepareVerifiedBuyerQuickAuditEmail(input({
    stripe: fixture({ session: paidSession({ customer_details: { email: "one@example.com" } as Stripe.Checkout.Session.CustomerDetails, customer_email: "two@example.com" }) }).stripe,
  })), /AUDIT_BUYER_DELIVERY_RECIPIENT_CONFLICT/)
  await assert.rejects(prepareVerifiedBuyerQuickAuditEmail(input({
    stripe: fixture({ session: paidSession({ customer_details: null, customer_email: null }) }).stripe,
  })), /AUDIT_BUYER_DELIVERY_RECIPIENT_UNVERIFIED/)
  await assert.rejects(prepareVerifiedBuyerQuickAuditEmail(input({
    report: { ...report, requestId: "different-request" },
  })), /AUDIT_BUYER_DELIVERY_REPORT_MISMATCH/)
})

test("no signing secret means no Stripe access, no email or token", async () => {
  const checked = fixture()
  await assert.rejects(prepareVerifiedBuyerQuickAuditEmail(input({
    signingSecret: undefined, stripe: checked.stripe,
  })), /AUDIT_BUYER_DELIVERY_TOKEN_UNCONFIGURED/)
  assert.equal(checked.calls(), 0)
})

test("does not issue links for wrong session mode or price configuration", async () => {
  await assert.rejects(prepareVerifiedBuyerQuickAuditEmail(input({
    expectedLivemode: true,
  })), /AUDIT_BUYER_DELIVERY_SCOPE_INVALID/)
  await assert.rejects(prepareVerifiedBuyerQuickAuditEmail(input({
    expectedPriceId: "NOT_A_STRIPE_PRICE",
  })), /AUDIT_BUYER_DELIVERY_SCOPE_INVALID/)
})
