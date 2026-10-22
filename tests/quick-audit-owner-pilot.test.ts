import assert from "node:assert/strict"
import test from "node:test"

import { NextRequest } from "next/server"
import type Stripe from "stripe"

import { createOwnerPilotCheckoutHandler } from "../lib/server/quick-audit-owner-pilot"

const origin = "https://aspect-audit-pilot.vercel.app"
const url = `${origin}/api/internal/quick-audit/owner-pilot/checkout`
const intake = {
  businessName: "Aspect Marketing Solutions",
  websiteUrl: "https://www.aspectmarketingsolutions.app",
  industry: "Marketing software and services",
  goals: "Check audit quality and customer workflow",
  notes: "Private synthetic-owner test: no public customer order",
}
const env: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  VERCEL_URL: "aspect-audit-pilot.vercel.app",
  AMS_QUICK_AUDIT_OWNER_PILOT_ENABLED: "true",
  AMS_QUICK_AUDIT_FULFILLMENT_READY: "true",
  AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL: "owner@example.com",
  AMS_OWNER_EMAIL: "owner@example.com",
  INTERNAL_ADMIN_SECRET: "test-internal-admin-secret-with-32-chars",
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  NEXTAUTH_SECRET: "test-nextauth-secret",
  UPSTASH_REDIS_REST_URL: "https://redis-mock.example.com",
  UPSTASH_REDIS_REST_TOKEN: "redis-mock-token",
  AMS_STRIPE_QUICK_AUDIT_WEBHOOK_SECRET: "whsec_mock",
  AMS_STRIPE_QUICK_AUDIT_SECRET_KEY: "sk_test_private_fixture",
  AMS_STRIPE_QUICK_AUDIT_PRICE_ID: "price_audit_test_fixture",
  AMS_QUICK_AUDIT_OWNER_PILOT_COUPON_ID: "coupon_owner_only_fixture",
}
const testCoupon = {
  id: "coupon_owner_only_fixture",
  valid: true,
  livemode: false,
  amount_off: 4400,
  currency: "usd",
  duration: "once",
  max_redemptions: 1,
  times_redeemed: 0,
} as const
const testPrice = {
  id: "price_audit_test_fixture",
  livemode: false,
  active: true,
  type: "one_time",
  currency: "usd",
  unit_amount: 4900,
} as const

function request(originHeader: string | null = origin, body: object = intake, next = url) {
  return new NextRequest(next, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(originHeader === null ? {} : { origin: originHeader }),
    },
    body: JSON.stringify(body),
  })
}

function fixture(overrides: {
  env?: NodeJS.ProcessEnv
  email?: string | null
  coupon?: typeof testCoupon | { [key: string]: unknown }
  price?: typeof testPrice | { [key: string]: unknown }
} = {}) {
  let calls = 0
  let params: Stripe.Checkout.SessionCreateParams | null = null
  return {
    calls: () => calls,
    params: () => params,
    handler: createOwnerPilotCheckoutHandler({
      env: overrides.env ?? env,
      uuid: () => "pilot-fixed-id",
      adminEmail: async () => overrides.email === undefined ? "owner@example.com" : overrides.email,
      retrieveCoupon: async () => (overrides.coupon ?? testCoupon) as Stripe.Coupon,
      retrievePrice: async () => (overrides.price ?? testPrice) as Stripe.Price,
      createSession: async (_secret, input) => {
        calls++
        params = input
        return { id: "cs_test_owner_pilot_123", url: "https://checkout.stripe.com/c/pay/test_fixture" }
      },
    }),
  }
}

test("owner pilot fails closed on main, disabled flag or missing ready gate", async () => {
  for (const overrides of [
    { VERCEL_ENV: "production" },
    { AMS_QUICK_AUDIT_OWNER_PILOT_ENABLED: "false" },
    { AMS_QUICK_AUDIT_FULFILLMENT_READY: "false" },
  ]) {
    const f = fixture({ env: { ...env, ...overrides } })
    const response = await f.handler(request())
    assert.equal(response.status, 404)
    assert.equal(f.calls(), 0)
    assert.equal(response.headers.get("cache-control"), "no-store")
  }
})

test("pilot cannot create a Checkout Session when test webhook, owner OAuth or Redis are absent", async () => {
  for (const override of [
    { AMS_STRIPE_QUICK_AUDIT_WEBHOOK_SECRET: "" },
    { UPSTASH_REDIS_REST_TOKEN: "" },
    { GOOGLE_CLIENT_SECRET: "" },
    { AMS_OWNER_EMAIL: "mismatched@example.com" },
  ]) {
    const f = fixture({ env: { ...env, ...override } })
    const response = await f.handler(request())
    assert.equal(response.status, 404)
    assert.equal(f.calls(), 0)
  }
})

test("pilot denies invalid admin identity and missing allowlist before Stripe", async () => {
  for (const options of [
    { email: "not-owner@example.com" },
    { email: null },
    { env: { ...env, AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL: "" } },
  ]) {
    const f = fixture(options)
    const response = await f.handler(request())
    assert.equal(response.status, 403)
    assert.equal(f.calls(), 0)
  }
})

test("pilot is protected against non-same-origin requests and invalid deployment URLs", async () => {
  const f = fixture()
  for (const incoming of [
    request(null),
    request("https://another.example.com"),
    request(origin, intake, "https://another.example.com/api/internal/quick-audit/owner-pilot/checkout"),
  ]) {
    const response = await f.handler(incoming)
    assert.equal(response.status, 403)
  }
  const badEnv = fixture({ env: { ...env, VERCEL_URL: "attacker.example.com" } })
  assert.equal((await badEnv.handler(request())).status, 403)
  assert.equal(f.calls(), 0)
})

test("pilot rejects unsafe or oversized intake without creating checkout", async () => {
  const f = fixture()
  for (const badInput of [
    { ...intake, websiteUrl: "file:///etc/passwd" },
    { ...intake, goals: "a".repeat(501) },
    { ...intake, unexpected: "not allowed" },
  ]) {
    const response = await f.handler(request(origin, badInput))
    assert.equal(response.status, 400)
  }
  assert.equal(f.calls(), 0)
})

test("pilot rejects expired/incorrect discounts and any price outside the $49 TEST audit product", async () => {
  for (const options of [
    { coupon: { ...testCoupon, amount_off: 4500 } },
    { coupon: { ...testCoupon, livemode: true } },
    { coupon: { ...testCoupon, times_redeemed: 1 } },
    { coupon: { ...testCoupon, max_redemptions: null } },
    { price: { ...testPrice, unit_amount: 500 } },
    { price: { ...testPrice, livemode: true } },
    { price: { ...testPrice, type: "recurring" } },
  ]) {
    const f = fixture(options)
    const response = await f.handler(request())
    assert.equal(response.status, 409)
    assert.equal(f.calls(), 0)
  }
})

test("owner $5 pilot reuses verified test audit price and original fulfillment metadata", async () => {
  const f = fixture()
  const response = await f.handler(request())
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.testMode, true)
  assert.equal(body.expectedTotalCents, 500)
  assert.equal(f.calls(), 1)
  const params = f.params()
  assert.equal(params?.mode, "payment")
  assert.equal(params?.line_items?.[0]?.price, "price_audit_test_fixture")
  assert.equal(params?.discounts?.[0]?.coupon, "coupon_owner_only_fixture")
  assert.equal(params?.metadata?.ams_offer, "quick-marketing-audit")
  assert.equal(params?.metadata?.ams_business_name, "Aspect Marketing Solutions")
  assert.equal(params?.metadata?.ams_pilot, "owner-preview-testmode")
  assert.equal(params?.metadata?.ams_website_url, intake.websiteUrl)
  assert.match(String(params?.success_url), /quick-marketing-audit\/thanks/)
  assert.equal(JSON.stringify(body).includes("sk_test_"), false)
  assert.equal(response.headers.get("cache-control"), "no-store")
})
