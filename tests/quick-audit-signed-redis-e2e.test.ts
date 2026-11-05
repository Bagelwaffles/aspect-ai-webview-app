import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"

import { NextRequest } from "next/server"
import Stripe from "stripe"

import { claimStripeEvent, completeStripeEvent, releaseStripeEvent } from "../lib/server/entitlements"
import { RedisQuickAuditStore } from "../lib/server/quick-audit-fulfillment"
import {
  RedisQuickAuditResultStore,
  createNativeQuickAuditAuditGateway,
} from "../lib/server/quick-audit-native"
import { createQuickAuditWebhookHandler } from "../lib/server/quick-audit-webhook"
import { createQuickAuditResultHandler } from "../lib/server/quick-audit-result"

const TEST_SITE = "https://www.aspectmarketingsolutions.app"
const TEST_PRICE = "price_ams_test_fixture"
const TEST_SECRET = "sk_test_ci_local_fixture"
const SIGNING_SECRET = "whsec_ams_local_ci_fixture"

/**
 * Full local webhook+Redis acceptance for the *real application handlers*.
 * Does not contact Stripe or production URLs. Run ONLY in CI with ephemeral
 * redis-rest service credentials and the explicit integration flag.
 */
test("signed local AMS pilot event creates one durable native audit and survives replay", async (t) => {
  if (process.env.AMS_AUDIT_EPHEMERAL_REDIS_TEST !== "true") {
    t.skip("Runs only against the ephemeral CI Redis service")
    return
  }
  assert.equal(process.env.UPSTASH_REDIS_REST_URL, "http://127.0.0.1:8079")
  assert.equal(process.env.UPSTASH_REDIS_REST_TOKEN, "ci-only-redis-rest-token")
  const id = randomUUID().replace(/-/g, "")
  const requestId = `quick-audit-ams-ci-${id}`
  const sessionId = `cs_test_ams${id}`
  const eventId = `evt_ams_ci_${id}`
  const session = {
    id: sessionId,
    object: "checkout.session",
    livemode: false,
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    metadata: {
      ams_offer: "quick-marketing-audit",
      ams_request_id: requestId,
      ams_business_name: "Aspect Marketing Solutions",
      ams_website_url: TEST_SITE,
      ams_industry: "AI marketing SaaS and business services",
      ams_goals: "Improve marketing audit buyer trust",
      ams_notes: "Ephemeral CI synthetic payment — no customer data",
    },
  } as unknown as Stripe.Checkout.Session
  const lineItems = {
    object: "list",
    has_more: false,
    data: [{ object: "item", id: "li_ams_ci_test", quantity: 1, price: { id: TEST_PRICE } }],
    url: `/v1/checkout/sessions/${sessionId}/line_items`,
  } as Stripe.ApiList<Stripe.LineItem>
  const event = {
    id: eventId,
    object: "event",
    api_version: "2023-10-16",
    created: Math.floor(Date.now() / 1000),
    data: { object: session },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type: "checkout.session.completed",
  } as Stripe.Event

  const stripe = new Stripe(TEST_SECRET)
  const api = stripe.checkout.sessions as unknown as {
    retrieve: (id: string) => Promise<Stripe.Checkout.Session>
    listLineItems: (id: string) => Promise<Stripe.ApiList<Stripe.LineItem>>
  }
  let stripeReadCount = 0
  api.retrieve = async (id) => {
    assert.equal(id, sessionId)
    stripeReadCount++
    return session
  }
  api.listLineItems = async (id) => {
    assert.equal(id, sessionId)
    return lineItems
  }
  const resultStore = new RedisQuickAuditResultStore()
  const handler = createQuickAuditWebhookHandler({
    env: {
      NODE_ENV: "test",
      AMS_STRIPE_QUICK_AUDIT_SECRET_KEY: TEST_SECRET,
      AMS_STRIPE_QUICK_AUDIT_WEBHOOK_SECRET: SIGNING_SECRET,
      AMS_STRIPE_QUICK_AUDIT_PRICE_ID: TEST_PRICE,
    },
    createStripe: () => stripe,
    claimEvent: claimStripeEvent,
    completeEvent: completeStripeEvent,
    releaseEvent: releaseStripeEvent,
    store: new RedisQuickAuditStore(),
    auditGateway: createNativeQuickAuditAuditGateway({
      store: resultStore,
      now: () => new Date("2026-10-21T12:00:00.000Z"),
    }),
    evidenceCollector: async (websiteUrl) => {
      assert.equal(websiteUrl, TEST_SITE)
      return {
        hasClearValueProposition: true,
        hasPrimaryCta: true,
        hasContactInfo: true,
        hasTitleAndMeta: true,
        hasTestimonials: false,
        hasLeadCapture: false,
        hasPrivacyPolicy: true,
        hasLocalBusinessSchema: null,
      }
    },
  })
  const body = JSON.stringify(event)
  const signature = stripe.webhooks.generateTestHeaderString({ payload: body, secret: SIGNING_SECRET })
  const incoming = () => new NextRequest("https://localhost.example/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": signature, "content-type": "application/json" },
    body,
  })

  const first = await handler(incoming())
  assert.equal(first?.status, 200)
  const firstBody = await first?.json()
  assert.equal(firstBody.applied, true)
  assert.equal(firstBody.duplicate, undefined)

  // Store is recreated so the second lookup proves actual shared Redis durability.
  const saved = await new RedisQuickAuditResultStore().getByRequestId(requestId)
  assert.ok(saved)
  assert.equal(saved?.websiteUrl, TEST_SITE)
  assert.equal(saved?.businessName, "Aspect Marketing Solutions")
  assert.equal(saved?.findings.length, 5)
  assert.equal(saved?.sevenDayPlan.length, 7)
  assert.ok(saved?.findings.some(f => f.basis === "automated-signal"))
  assert.ok(saved?.findings.some(f => f.basis === "strategic-recommendation"))
  assert.equal(saved?.findings.some(f => f.title.includes("Local discovery")), false)

  const second = await handler(incoming())
  assert.equal(second?.status, 200)
  const secondBody = await second?.json()
  assert.equal(secondBody.duplicate, true)
  assert.equal(secondBody.applied, undefined)
  assert.equal(stripeReadCount, 1, "no duplicated Stripe session reads or audit execution")

  const read = createQuickAuditResultHandler({
    env: {
      NODE_ENV: "test",
      AMS_STRIPE_QUICK_AUDIT_SECRET_KEY: TEST_SECRET,
      AMS_STRIPE_QUICK_AUDIT_PRICE_ID: TEST_PRICE,
    },
    createStripe: () => stripe,
    store: new RedisQuickAuditResultStore(),
  })
  const returned = await read(new NextRequest(
    `https://localhost.example/api/quick-marketing-audit/result?session_id=${sessionId}`
  ))
  assert.equal(returned.status, 200)
  assert.equal(returned.headers.get("cache-control"), "no-store")
  const result = await returned.json()
  assert.equal(result.status, "completed")
  assert.equal(result.result.auditId, saved?.auditId)
  assert.equal(result.result.generatedAt, "2026-10-21T12:00:00.000Z")

  const invalidSig = await handler(new NextRequest("https://localhost.example/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "invalid", "content-type": "application/json" },
    body,
  }))
  assert.equal(invalidSig, null)
})
