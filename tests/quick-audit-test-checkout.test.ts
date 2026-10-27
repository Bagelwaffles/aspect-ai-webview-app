import assert from "node:assert/strict"
import test from "node:test"

import { NextRequest } from "next/server"
import type Stripe from "stripe"

import { createQuickAuditTestCheckoutHandler, matchesOwnerPilotFixtures } from "../lib/server/quick-audit-test-checkout"

const adminSecret = "a".repeat(40)

function request(cookie = "valid-admin-token", origin = "https://www.aspectmarketingsolutions.app", body = "{}") {
  return new NextRequest(origin + "/api/internal/quick-audit-test/checkout", {
    method: "POST",
    headers: {
      cookie: `ams_internal_admin_access=${cookie}`,
      "content-type": "application/json",
    },
    body,
  })
}

function testEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    ...overrides,
    NODE_ENV: overrides.NODE_ENV ?? "test",
    INTERNAL_ADMIN_SECRET: overrides.INTERNAL_ADMIN_SECRET ?? adminSecret,
    AMS_STRIPE_QUICK_AUDIT_SECRET_KEY:
      overrides.AMS_STRIPE_QUICK_AUDIT_SECRET_KEY ?? "sk_test_fixture",
    AMS_STRIPE_QUICK_AUDIT_PRICE_ID:
      overrides.AMS_STRIPE_QUICK_AUDIT_PRICE_ID ?? "price_test_fixture",
    PUBLIC_APP_URL: overrides.PUBLIC_APP_URL ?? "https://www.aspectmarketingsolutions.app",
  }
}

const verifyAdminCookie = async (token: string | undefined) =>
  token === "valid-admin-token" ? { email: "owner@example.com" } : null

test("Quick Audit test lane rejects unauthenticated callers before Stripe work", async () => {
  let calls = 0
  const handler = createQuickAuditTestCheckoutHandler({
    env: testEnv(),
    verifyAdminCookie,
    createSession: async () => {
      calls += 1
      return { id: "cs_test_unexpected", url: "https://checkout.stripe.com/test", livemode: false }
    },
  })

  const response = await handler(request("invalid"))
  assert.equal(response.status, 401)
  assert.equal((await response.json()).code, "QUICK_AUDIT_TEST_UNAUTHORIZED")
  assert.equal(calls, 0)
})

test("Quick Audit test lane refuses live Stripe keys", async () => {
  let calls = 0
  const handler = createQuickAuditTestCheckoutHandler({
    env: testEnv({ AMS_STRIPE_QUICK_AUDIT_SECRET_KEY: "sk_live_never_use_here" }),
    verifyAdminCookie,
    createSession: async () => {
      calls += 1
      return { id: "cs_test_unexpected", url: "https://checkout.stripe.com/test", livemode: false }
    },
  })

  const response = await handler(request())
  assert.equal(response.status, 503)
  assert.equal((await response.json()).code, "QUICK_AUDIT_TEST_UNCONFIGURED")
  assert.equal(calls, 0)
})

test("Quick Audit test lane creates a fixed fake-data $49 test Checkout without public sales flags", async () => {
  let secret = ""
  let params: Stripe.Checkout.SessionCreateParams | null = null
  let idempotencyKey = ""
  const handler = createQuickAuditTestCheckoutHandler({
    env: testEnv({
      AMS_QUICK_AUDIT_PUBLIC_SALES_ENABLED: "false",
      AMS_QUICK_AUDIT_FULFILLMENT_READY: "false",
    }),
    idFactory: () => "fixed-e2e-id",
    verifyAdminCookie,
    createSession: async (key, input, options) => {
      secret = key
      params = input
      idempotencyKey = options.idempotencyKey ?? ""
      return {
        id: "cs_test_nativee2e",
        url: "https://checkout.stripe.com/c/pay/cs_test_nativee2e",
        livemode: false,
      }
    },
  })

  const response = await handler(request())
  const body = await response.json()
  const created = params as Stripe.Checkout.SessionCreateParams | null

  assert.equal(response.status, 200)
  assert.equal(body.sessionId, "cs_test_nativee2e")
  assert.equal(secret, "sk_test_fixture")
  assert.equal(created?.mode, "payment")
  assert.equal(created?.line_items?.[0]?.price, "price_test_fixture")
  assert.equal(created?.line_items?.[0]?.quantity, 1)
  assert.equal(created?.discounts, undefined)
  assert.equal(created?.customer_email, "quick-audit-e2e@example.com")
  assert.equal(created?.metadata?.ams_offer, "quick-marketing-audit")
  assert.equal(created?.metadata?.ams_environment, "test-e2e")
  assert.equal(created?.metadata?.ams_request_id, "quick-audit-e2e-fixed-e2e-id")
  assert.equal(created?.metadata?.ams_business_name, "Aspect Marketing Solutions E2E Fixture")
  assert.equal(idempotencyKey, "quick-audit-e2e-fixed-e2e-id")
  assert.equal(JSON.stringify(body).includes("sk_test_fixture"), false)
})

test("Quick Audit test lane rejects any Checkout Session that Stripe reports as live", async () => {
  const handler = createQuickAuditTestCheckoutHandler({
    env: testEnv(),
    verifyAdminCookie,
    createSession: async () => ({
      id: "cs_live_wrongmode",
      url: "https://checkout.stripe.com/live",
      livemode: true,
    }),
  })

  const response = await handler(request())
  assert.equal(response.status, 502)
  assert.equal((await response.json()).code, "QUICK_AUDIT_TEST_MODE_MISMATCH")
})

const pilotOrigin = "https://ams-owner-pilot-preview.vercel.app"
const pilotPrice = "price_1U47ZwGloGM6sjzB3awn1s2A"
const pilotCoupon = "coupon_ams_owner_audit_pilot_20261021"

function pilotEnv(overrides: Partial<NodeJS.ProcessEnv> = {}) {
  return testEnv({
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "feat/audit-delivery-security-preview-20261023",
    PUBLIC_APP_URL: pilotOrigin,
    AMS_STRIPE_WEBHOOK_MODE: "test",
    AMS_STRIPE_QUICK_AUDIT_PRICE_ID: pilotPrice,
    AMS_QUICK_AUDIT_OWNER_PILOT_COUPON_ID: pilotCoupon,
    AMS_QUICK_AUDIT_OWNER_PILOT_ENABLED: "true",
    AMS_QUICK_AUDIT_OWNER_PILOT_WEBHOOK_VERIFIED: "true",
    AMS_QUICK_AUDIT_OWNER_PILOT_REDIS_VERIFIED: "true",
    AMS_QUICK_AUDIT_OWNER_PILOT_FULFILLMENT_VERIFIED: "true",
    AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "false",
    AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED: "false",
    AMS_QUICK_AUDIT_PUBLIC_SALES_ENABLED: "false",
    ...overrides,
  })
}

function pilotRequest(origin = pilotOrigin, cookie = "valid-admin-token") {
  return request(cookie, origin, '{"pilot":"owner-five-dollar"}')
}

const verifiedPrice = {
  id: pilotPrice,
  active: true,
  currency: "usd",
  unit_amount: 4900,
  type: "one_time" as const,
  product: "prod_V4G6IWGLJGKtun",
}
const verifiedCoupon = {
  id: pilotCoupon,
  valid: true,
  currency: "usd",
  amount_off: 4400,
  duration: "once" as const,
  times_redeemed: 0,
  max_redemptions: 1,
  applies_to: { products: ["prod_V4G6IWGLJGKtun"] },
}

test("owner pilot fixtures reject wrong Stripe account, Price, product or redeemed coupon", () => {
  const account = "acct_1Smr2bGloGM6sjzB"
  assert.equal(matchesOwnerPilotFixtures(account, verifiedPrice, verifiedCoupon), true)
  assert.equal(matchesOwnerPilotFixtures("acct_1UTtFMGuhFCl8JHa", verifiedPrice, verifiedCoupon), false)
  assert.equal(matchesOwnerPilotFixtures(account, { ...verifiedPrice, unit_amount: 500 }, verifiedCoupon), false)
  assert.equal(matchesOwnerPilotFixtures(account, { ...verifiedPrice, product: "prod_wrong" }, verifiedCoupon), false)
  assert.equal(matchesOwnerPilotFixtures(account, verifiedPrice, { ...verifiedCoupon, amount_off: 4000 }), false)
  assert.equal(matchesOwnerPilotFixtures(account, verifiedPrice, { ...verifiedCoupon, times_redeemed: 1 }), false)
  assert.equal(matchesOwnerPilotFixtures(account, verifiedPrice, { ...verifiedCoupon, applies_to: { products: ["prod_wrong"] } }), false)
  assert.equal(matchesOwnerPilotFixtures(account, verifiedPrice, { ...verifiedCoupon, valid: false }), false)
})

test("owner pilot refuses unauthorized requests and unrecognized test modes without Stripe work", async () => {
  let calls = 0
  const handler = createQuickAuditTestCheckoutHandler({
    env: pilotEnv(), verifyAdminCookie,
    verifyPilotConfiguration: async () => { calls++; return true },
    createSession: async () => { calls++; throw Error("must not call") },
  })
  const unauthorized = await handler(pilotRequest(pilotOrigin, "invalid"))
  assert.equal(unauthorized.status, 401)
  const invalid = await handler(request("valid-admin-token", pilotOrigin, '{"pilot":"unknown"}'))
  assert.equal(invalid.status, 400)
  assert.equal((await invalid.json()).code, "QUICK_AUDIT_TEST_INVALID_REQUEST")
  assert.equal(calls, 0)
})

test("owner pilot fails closed on wrong environment, host, price, webhook, store, fulfillment or public sales", async () => {
  const checks: Array<[string, Partial<NodeJS.ProcessEnv>]> = [
    ["pilot switch", { AMS_QUICK_AUDIT_OWNER_PILOT_ENABLED: "false" }],
    ["production", { VERCEL_ENV: "production" }],
    ["wrong branch", { VERCEL_GIT_COMMIT_REF: "main" }],
    ["wrong price", { AMS_STRIPE_QUICK_AUDIT_PRICE_ID: "price_other" }],
    ["wrong coupon", { AMS_QUICK_AUDIT_OWNER_PILOT_COUPON_ID: "coupon_other" }],
    ["wrong webhook mode", { AMS_STRIPE_WEBHOOK_MODE: "live" }],
    ["no webhook proof", { AMS_QUICK_AUDIT_OWNER_PILOT_WEBHOOK_VERIFIED: "false" }],
    ["no Redis proof", { AMS_QUICK_AUDIT_OWNER_PILOT_REDIS_VERIFIED: "false" }],
    ["no fulfillment proof", { AMS_QUICK_AUDIT_OWNER_PILOT_FULFILLMENT_VERIFIED: "false" }],
    ["send enabled", { AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "true" }],
    ["outbox enabled", { AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED: "true" }],
    ["public sales enabled", { AMS_QUICK_AUDIT_PUBLIC_SALES_ENABLED: "true" }],
    ["subscription enabled", { AMS_SUBSCRIPTION_CHECKOUT_ENABLED: "true" }],
    ["wrong return origin", { PUBLIC_APP_URL: "https://www.aspectmarketingsolutions.app" }],
  ]
  for (const [label, overrides] of checks) {
    let stripeCalls = 0
    const handler = createQuickAuditTestCheckoutHandler({
      env: pilotEnv(overrides), verifyAdminCookie,
      verifyPilotConfiguration: async () => { stripeCalls++; return true },
      createSession: async () => { stripeCalls++; throw Error("must not call") },
    })
    const response = await handler(pilotRequest())
    assert.equal(response.status, 503, label)
    assert.equal((await response.json()).code, "QUICK_AUDIT_OWNER_PILOT_DISABLED", label)
    assert.equal(stripeCalls, 0, label)
  }
})

test("owner pilot refuses Stripe identity verification failure before creating Checkout", async () => {
  let creates = 0
  const handler = createQuickAuditTestCheckoutHandler({
    env: pilotEnv(), verifyAdminCookie,
    verifyPilotConfiguration: async () => false,
    createSession: async () => { creates++; throw Error("unexpected") },
  })
  const response = await handler(pilotRequest())
  assert.equal(response.status, 503)
  assert.equal((await response.json()).code, "QUICK_AUDIT_OWNER_PILOT_UNVERIFIED")
  assert.equal(creates, 0)
})

test("owner pilot applies the original coupon and releases URL only after exact $5 Stripe read-back", async () => {
  let params: Stripe.Checkout.SessionCreateParams | null = null
  let verified = 0
  let readback = 0
  const handler = createQuickAuditTestCheckoutHandler({
    env: pilotEnv(), verifyAdminCookie,
    idFactory: () => "owner-pilot-fixture",
    verifyPilotConfiguration: async (key, price, coupon) => {
      verified++
      assert.equal(key, "sk_test_fixture")
      assert.equal(price, pilotPrice)
      assert.equal(coupon, pilotCoupon)
      return true
    },
    createSession: async (_key, values) => {
      params = values
      return { id: "cs_test_ownerpilot", url: "https://checkout.stripe.com/c/pay/cs_test_ownerpilot", livemode: false }
    },
    retrievePilotSession: async (_key, sessionId) => {
      readback++
      assert.equal(sessionId, "cs_test_ownerpilot")
      return { id: sessionId, livemode: false, amount_subtotal: 4900, amount_discount: 4400, amount_total: 500,
        currency: "usd", payment_status: "unpaid" }
    },
  })
  const response = await handler(pilotRequest())
  const body = await response.json()
  const created = params as Stripe.Checkout.SessionCreateParams | null
  assert.equal(response.status, 200)
  assert.equal(verified, 1)
  assert.equal(readback, 1)
  assert.deepEqual(created?.discounts, [{ coupon: pilotCoupon }])
  assert.equal(created?.line_items?.[0]?.price, pilotPrice)
  assert.equal(created?.allow_promotion_codes, false)
  assert.equal(created?.automatic_tax?.enabled, false)
  assert.equal(created?.metadata?.ams_environment, "test-five-dollar-pilot")
  assert.equal(body.verifiedTestTotalCents, 500)
  assert.equal(body.sessionId, "cs_test_ownerpilot")
})

test("owner pilot never returns a Checkout URL for wrong amount, currency, mode or session", async () => {
  const mismatches = [
    { amount_total: 4900 }, { amount_discount: 0 }, { amount_subtotal: 500 },
    { currency: "eur" }, { payment_status: "paid" as const },
    { livemode: true }, { id: "cs_test_wrong" },
  ]
  for (const mismatch of mismatches) {
    const handler = createQuickAuditTestCheckoutHandler({
      env: pilotEnv(), verifyAdminCookie,
      verifyPilotConfiguration: async () => true,
      createSession: async () => ({ id: "cs_test_right", url: "https://checkout.stripe.com/test", livemode: false }),
      retrievePilotSession: async () => ({ id: "cs_test_right", livemode: false,
        amount_total: 500, amount_subtotal: 4900, amount_discount: 4400,
        currency: "usd", payment_status: "unpaid", ...mismatch }),
    })
    const response = await handler(pilotRequest())
    const body = await response.json()
    assert.equal(response.status, 502)
    assert.equal(body.code, "QUICK_AUDIT_OWNER_PILOT_TOTAL_MISMATCH")
    assert.equal(body.url, undefined)
  }
})
