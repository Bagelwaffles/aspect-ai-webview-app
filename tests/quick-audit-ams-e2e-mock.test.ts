import assert from "node:assert/strict"
import test from "node:test"

import { NextRequest } from "next/server"
import type Stripe from "stripe"

import { createOwnerPilotCheckoutHandler } from "../lib/server/quick-audit-owner-pilot"
import {
  processQuickAuditCheckout,
  type QuickAuditRecord,
  type QuickAuditStore,
} from "../lib/server/quick-audit-fulfillment"
import {
  createNativeQuickAuditAuditGateway,
  type NativeQuickAuditResult,
  type QuickAuditResultStore,
} from "../lib/server/quick-audit-native"
import { createQuickAuditResultHandler } from "../lib/server/quick-audit-result"

const site = "https://www.aspectmarketingsolutions.app"
const preview = "https://ams-pilot-preview.vercel.app"
const testPrice = "price_owner_pilot_fixture"
const sessionId = "cs_test_amsownerpilot123"
const orderId = "quick-audit-ams-pilot-001"

const env: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  VERCEL_URL: "ams-pilot-preview.vercel.app",
  AMS_OWNER_EMAIL: "owner@example.com",
  AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL: "owner@example.com",
  INTERNAL_ADMIN_SECRET: "test-only-mock-32-byte-session-secret",
  GOOGLE_CLIENT_ID: "mock-google-client",
  GOOGLE_CLIENT_SECRET: "mock-google-secret",
  NEXTAUTH_SECRET: "mock-nextauth-secret",
  AMS_STRIPE_QUICK_AUDIT_SECRET_KEY: "sk_test_mock",
  AMS_STRIPE_QUICK_AUDIT_WEBHOOK_SECRET: "whsec_mock",
  AMS_STRIPE_QUICK_AUDIT_PRICE_ID: testPrice,
  AMS_QUICK_AUDIT_OWNER_PILOT_COUPON_ID: "coupon_mock_once",
  UPSTASH_REDIS_REST_URL: "https://mock-redis.example",
  UPSTASH_REDIS_REST_TOKEN: "mock-only-token",
  AMS_QUICK_AUDIT_FULFILLMENT_READY: "true",
  AMS_QUICK_AUDIT_OWNER_PILOT_ENABLED: "true",
}

class MockAuditResults implements QuickAuditResultStore {
  readonly values = new Map<string, NativeQuickAuditResult>()
  async getByRequestId(requestId: string) { return this.values.get(requestId) ?? null }
  async save(result: NativeQuickAuditResult) { this.values.set(result.requestId, result) }
}

class MockFulfillmentLedger implements QuickAuditStore {
  private completed: QuickAuditRecord | null = null
  async reserve(input: { checkoutSessionId: string; stripeEventId: string; requestId: string }) {
    if (this.completed) return { state: "duplicate" as const, record: this.completed }
    assert.equal(input.checkoutSessionId, sessionId)
    return { state: "reserved" as const, token: "mock-lock-123" }
  }
  async complete(input: QuickAuditRecord & { token: string }) {
    assert.equal(input.token, "mock-lock-123")
    const { token: _token, ...record } = input
    this.completed = record
  }
  async release() { this.completed = null }
}

test("AMS-on-AMS $5 simulated checkout produces one verifiable five-finding report without a real payment", async () => {
  let createdCheckout: Stripe.Checkout.SessionCreateParams | null = null
  const checkout = createOwnerPilotCheckoutHandler({
    env,
    uuid: () => "ams-pilot-001",
    adminEmail: async () => "owner@example.com",
    retrieveCoupon: async () => ({
      id: "coupon_mock_once", amount_off: 4400, currency: "usd",
      duration: "once", livemode: false, valid: true,
      max_redemptions: 1, times_redeemed: 0,
    }),
    retrievePrice: async () => ({
      id: testPrice, unit_amount: 4900, currency: "usd",
      active: true, livemode: false, type: "one_time",
    }),
    createSession: async (_key, params) => {
      createdCheckout = params
      return { id: sessionId, url: "https://checkout.stripe.com/c/pay/mock-ams-pilot" }
    },
  })
  const res = await checkout(new NextRequest(`${preview}/api/internal/quick-audit/owner-pilot/checkout`, {
    method: "POST",
    headers: { origin: preview, "content-type": "application/json" },
    body: JSON.stringify({
      businessName: "Aspect Marketing Solutions",
      websiteUrl: site,
      industry: "AI marketing SaaS and business services",
      goals: "Make the AMS Quick Marketing Audit offer easier to understand",
      notes: "Sandbox mock acceptance — never a public testimonial",
    }),
  }))
  assert.equal(res.status, 200)
  const checkoutBody = await res.json()
  assert.equal(checkoutBody.expectedTotalCents, 500)
  assert.equal(createdCheckout?.line_items?.[0]?.price, testPrice)
  assert.equal(createdCheckout?.discounts?.[0]?.coupon, "coupon_mock_once")
  assert.equal(createdCheckout?.metadata?.ams_request_id, orderId)

  const paidTestSession = {
    id: sessionId,
    object: "checkout.session",
    livemode: false,
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    metadata: createdCheckout?.metadata,
  } as unknown as Stripe.Checkout.Session
  const lineItems = {
    object: "list",
    data: [{ object: "item", id: "li_ams_pilot", quantity: 1, price: { id: testPrice } }],
    has_more: false,
    url: `/v1/checkout/sessions/${sessionId}/line_items`,
  } as unknown as Stripe.ApiList<Stripe.LineItem>
  const event = {
    id: "evt_test_ams_pilot_001",
    object: "event",
    type: "checkout.session.completed",
    livemode: false,
    data: { object: paidTestSession },
  } as unknown as Stripe.Event

  const auditResults = new MockAuditResults()
  const ledger = new MockFulfillmentLedger()
  const run = () => processQuickAuditCheckout({
    event,
    expectedLivemode: false,
    expectedPriceId: testPrice,
    store: ledger,
    gateway: {
      retrieveCheckoutSession: async () => paidTestSession,
      listLineItems: async () => lineItems,
    },
    evidenceCollector: async (url) => {
      assert.equal(url, site)
      return {
        hasClearValueProposition: true,
        hasPrimaryCta: true,
        hasContactInfo: true,
        hasTitleAndMeta: true,
        hasTestimonials: false,
        hasLeadCapture: false,
        hasLocalBusinessSchema: false,
        hasPrivacyPolicy: true,
      }
    },
    auditGateway: createNativeQuickAuditAuditGateway({
      store: auditResults,
      now: () => new Date("2026-10-21T12:00:00.000Z"),
    }),
  })
  const first = await run()
  assert.equal(first.applied, true)
  assert.equal(auditResults.values.size, 1)
  const duplicate = await run()
  assert.equal(duplicate.duplicate, true)
  assert.equal(auditResults.values.size, 1)

  const stripe = {
    checkout: {
      sessions: {
        retrieve: async () => paidTestSession,
        listLineItems: async () => lineItems,
      },
    },
  } as unknown as Stripe
  const resultResponse = await createQuickAuditResultHandler({
    env,
    createStripe: () => stripe,
    store: auditResults,
  })(new NextRequest(`${preview}/api/quick-marketing-audit/result?session_id=${sessionId}`))
  const body = await resultResponse.json()
  assert.equal(resultResponse.status, 200)
  assert.equal(resultResponse.headers.get("cache-control"), "no-store")
  assert.equal(body.status, "completed")
  assert.equal(body.result.businessName, "Aspect Marketing Solutions")
  assert.equal(body.result.websiteUrl, site)
  assert.equal(body.result.findings.length, 5)
  assert.equal(body.result.sevenDayPlan.length, 7)
  assert.ok(body.result.findings.some((finding: NativeQuickAuditResult["findings"][number]) => finding.basis === "automated-signal"))
  assert.ok(body.result.findings.some((finding: NativeQuickAuditResult["findings"][number]) => finding.basis === "strategic-recommendation"))
  assert.equal(body.result.findings.some((finding: NativeQuickAuditResult["findings"][number]) => finding.title.includes("Local discovery")), false)
})
