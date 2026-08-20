import assert from "node:assert/strict"
import test from "node:test"

import { NextRequest } from "next/server"
import type Stripe from "stripe"

import {
  buildNativeQuickAuditResult,
  createNativeQuickAuditAuditGateway,
  type NativeQuickAuditResult,
  type QuickAuditResultStore,
} from "../lib/server/quick-audit-native"
import { createQuickAuditResultHandler } from "../lib/server/quick-audit-result"

class MemoryResultStore implements QuickAuditResultStore {
  records = new Map<string, NativeQuickAuditResult>()
  saves = 0

  async getByRequestId(requestId: string) {
    return this.records.get(requestId) ?? null
  }

  async save(result: NativeQuickAuditResult) {
    this.saves += 1
    this.records.set(result.requestId, result)
  }
}

const nativeInput = {
  businessName: "Example Services",
  websiteUrl: "https://example.com",
  industry: "Professional services",
  goals: "get more qualified leads",
  notes: "",
  requestId: "quick-audit-request-native-001",
  evidence: {
    hasClearValueProposition: false,
    hasPrimaryCta: false,
    hasContactInfo: true,
    hasLocalBusinessSchema: null,
    hasTitleAndMeta: true,
    hasRecentContent: null,
    hasTestimonials: false,
    hasPrivacyPolicy: true,
    hasLeadCapture: false,
    hasFollowUpProcess: null,
  },
}

function paidSession(overrides: Partial<Stripe.Checkout.Session> = {}) {
  return {
    id: "cs_live_native123",
    object: "checkout.session",
    livemode: true,
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    metadata: {
      ams_offer: "quick-marketing-audit",
      ams_request_id: nativeInput.requestId,
    },
    ...overrides,
  } as Stripe.Checkout.Session
}

function stripeFixture(session = paidSession(), priceId = "price_native") {
  return {
    checkout: {
      sessions: {
        retrieve: async () => session,
        listLineItems: async () => ({
          object: "list",
          data: [{ id: "li_native", object: "item", quantity: 1, price: { id: priceId } }],
          has_more: false,
          url: "/v1/checkout/sessions/cs_live_native123/line_items",
        }),
      },
    },
  } as unknown as Stripe
}

test("native Quick Audit always produces the promised five findings and seven-day plan", () => {
  const result = buildNativeQuickAuditResult({
    ...nativeInput,
    now: () => new Date("2026-08-20T12:00:00.000Z"),
  })

  assert.equal(result.version, "native-v1")
  assert.equal(result.findings.length, 5)
  assert.equal(result.sevenDayPlan.length, 7)
  assert.equal(result.sevenDayPlan.map((day) => day.day).join(","), "1,2,3,4,5,6,7")
  assert.match(result.auditId, /^audit_[a-f0-9]{24}$/)
  assert.equal(result.generatedAt, "2026-08-20T12:00:00.000Z")
  assert.equal(result.promotionalPost.includes(nativeInput.websiteUrl), true)
})

test("native Quick Audit IDs are deterministic per request and gateway replay does not save twice", async () => {
  const store = new MemoryResultStore()
  const gateway = createNativeQuickAuditAuditGateway({
    store,
    now: () => new Date("2026-08-20T12:00:00.000Z"),
  })

  const first = await gateway.run(nativeInput)
  const second = await gateway.run(nativeInput)

  assert.equal(first.auditId, second.auditId)
  assert.equal(store.saves, 1)
  assert.equal(store.records.size, 1)
})

test("paid live Quick Audit session can retrieve only its durable native result", async () => {
  const store = new MemoryResultStore()
  const result = buildNativeQuickAuditResult(nativeInput)
  await store.save(result)
  const handler = createQuickAuditResultHandler({
    env: {
      NODE_ENV: "test",
      AMS_STRIPE_QUICK_AUDIT_LIVE_SECRET_KEY: "rk_live_fixture",
      AMS_STRIPE_QUICK_AUDIT_LIVE_PRICE_ID: "price_native",
    },
    createStripe: () => stripeFixture(),
    store,
  })

  const response = await handler(new NextRequest("https://ams.example/api/quick-marketing-audit/result?session_id=cs_live_native123"))
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.status, "completed")
  assert.equal(body.result.auditId, result.auditId)
  assert.equal(response.headers.get("cache-control"), "no-store")
  assert.equal(JSON.stringify(body).includes("rk_live_fixture"), false)
})

test("unpaid, wrong-price, and unrelated sessions never receive a Quick Audit result", async () => {
  const store = new MemoryResultStore()
  const result = buildNativeQuickAuditResult(nativeInput)
  await store.save(result)

  for (const scenario of [
    { session: paidSession({ payment_status: "unpaid" }), price: "price_native" },
    { session: paidSession(), price: "price_other" },
    { session: paidSession({ metadata: { ams_offer: "other-offer", ams_request_id: nativeInput.requestId } }), price: "price_native" },
  ]) {
    const handler = createQuickAuditResultHandler({
      env: {
        NODE_ENV: "test",
        AMS_STRIPE_QUICK_AUDIT_LIVE_SECRET_KEY: "rk_live_fixture",
        AMS_STRIPE_QUICK_AUDIT_LIVE_PRICE_ID: "price_native",
      },
      createStripe: () => stripeFixture(scenario.session, scenario.price),
      store,
    })
    const response = await handler(new NextRequest("https://ams.example/api/quick-marketing-audit/result?session_id=cs_live_native123"))
    assert.equal(response.status, 403)
  }
})

test("verified paid order returns processing without inventing a result", async () => {
  const store = new MemoryResultStore()
  const handler = createQuickAuditResultHandler({
    env: {
      NODE_ENV: "test",
      AMS_STRIPE_QUICK_AUDIT_LIVE_SECRET_KEY: "rk_live_fixture",
      AMS_STRIPE_QUICK_AUDIT_LIVE_PRICE_ID: "price_native",
    },
    createStripe: () => stripeFixture(),
    store,
  })

  const response = await handler(new NextRequest("https://ams.example/api/quick-marketing-audit/result?session_id=cs_live_native123"))
  const body = await response.json()
  assert.equal(response.status, 202)
  assert.equal(body.status, "processing")
})
