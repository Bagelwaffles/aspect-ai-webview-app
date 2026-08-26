import assert from "node:assert/strict"
import test from "node:test"

import { NextRequest } from "next/server"
import type Stripe from "stripe"

import { customerSubjectFromProviderSubject } from "../lib/auth"
import { creditTopupPack } from "../lib/credit-topups"
import { createCreditTopupCheckoutHandler } from "../lib/server/credit-topup-checkout"
import type { EntitlementSnapshot } from "../lib/server/entitlements"

const subjectCandidate = customerSubjectFromProviderSubject("credit-topup-checkout")
if (!subjectCandidate) throw new Error("Stable test subject is required")
const subject: string = subjectCandidate

const principal = {
  kind: "customer" as const,
  subject,
  billingEmail: "buyer@example.com",
  email: "buyer@example.com",
}

function snapshot(status: EntitlementSnapshot["subscriptionStatus"] = "active"): EntitlementSnapshot {
  return {
    configured: true,
    subject,
    billingEmail: principal.billingEmail,
    plan: status === "active" || status === "trialing" ? "starter" : null,
    subscriptionStatus: status,
    planCredits: 20,
    topupCredits: 5,
    totalCredits: 25,
    agentSlugs: [],
    stripeCustomerId: "cus_topup_fixture",
    stripeSubscriptionId: status === "active" || status === "trialing" ? "sub_topup_fixture" : null,
  }
}

function price(packSlug: "100" | "300" | "1000"): Stripe.Price {
  const pack = creditTopupPack(packSlug)
  return {
    id: `price_topup_${pack.slug}`,
    object: "price",
    active: true,
    currency: "usd",
    lookup_key: pack.lookupKey,
    metadata: {
      offer_type: "credit_topup",
      topup_units: String(pack.units),
      subscriber_only: "true",
      non_expiring: "true",
    },
    recurring: null,
    type: "one_time",
    unit_amount: pack.priceCents,
  } as unknown as Stripe.Price
}

function request(
  body: unknown,
  userAgent = "Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36",
) {
  return new NextRequest("https://www.aspectmarketingsolutions.app/api/billing/topup", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": userAgent,
    },
    body: JSON.stringify(body),
  })
}

test("active subscriber receives a one-time Checkout Session for the exact approved pack", async () => {
  const pack = creditTopupPack("300")
  const captured: {
    params?: Stripe.Checkout.SessionCreateParams
    options?: Stripe.RequestOptions
  } = {}

  const handler = createCreditTopupCheckoutHandler({
    authorize: async () => principal,
    getEntitlements: async () => snapshot("active"),
    env: {
      NODE_ENV: "test",
      STRIPE_SECRET_KEY: "sk_test_credit_topup_fixture",
      AMS_STRIPE_WEBHOOK_MODE: "test",
      PUBLIC_APP_URL: "https://www.aspectmarketingsolutions.app",
    },
    resolvePrice: async (_secretKey, resolvedPack) => {
      assert.equal(resolvedPack.slug, "300")
      return price("300")
    },
    createSession: async (_secretKey, params, options) => {
      captured.params = params
      captured.options = options
      return { id: "cs_topup_300", url: "https://checkout.stripe.com/c/pay/topup-fixture" }
    },
  })

  const response = await handler(request({ pack: "300", requestId: "request_1234567890abcdef" }))
  const payload = await response.json()
  const checkoutParams = captured.params
  const checkoutOptions = captured.options

  assert.equal(response.status, 200)
  assert.equal(payload.ok, true)
  assert.equal(payload.units, 300)
  assert.ok(checkoutParams)
  assert.ok(checkoutOptions)
  assert.equal(checkoutParams.mode, "payment")
  assert.deepEqual(checkoutParams.payment_method_types, ["card"])
  assert.equal(checkoutParams.client_reference_id, subject)
  assert.equal(checkoutParams.customer, "cus_topup_fixture")
  assert.deepEqual(checkoutParams.line_items, [{ price: "price_topup_300", quantity: 1 }])
  assert.equal(checkoutParams.metadata?.ams_offer, "credit-topup")
  assert.equal(checkoutParams.metadata?.customerSubject, subject)
  assert.equal(checkoutParams.metadata?.topupUnits, String(pack.units))
  assert.equal(checkoutParams.metadata?.priceLookupKey, pack.lookupKey)
  assert.equal(checkoutParams.payment_intent_data?.metadata?.customerSubject, subject)
  assert.equal(
    checkoutParams.success_url,
    "https://www.aspectmarketingsolutions.app/billing/topup/success?session_id={CHECKOUT_SESSION_ID}",
  )
  assert.equal(checkoutParams.cancel_url, "https://www.aspectmarketingsolutions.app/billing")
  assert.match(String(checkoutOptions.idempotencyKey), /^ams-topup-checkout-[a-f0-9]{64}$/)
})

test("inactive accounts cannot buy subscriber-only top-up credits", async () => {
  let stripeTouched = false
  const handler = createCreditTopupCheckoutHandler({
    authorize: async () => principal,
    getEntitlements: async () => snapshot("inactive"),
    env: {
      NODE_ENV: "test",
      STRIPE_SECRET_KEY: "sk_test_credit_topup_fixture",
      AMS_STRIPE_WEBHOOK_MODE: "test",
      PUBLIC_APP_URL: "https://www.aspectmarketingsolutions.app",
    },
    resolvePrice: async () => {
      stripeTouched = true
      return price("100")
    },
    createSession: async () => {
      stripeTouched = true
      return { id: "unexpected", url: "https://example.test/unexpected" }
    },
  })

  const response = await handler(request({ pack: "100", requestId: "request_1234567890abcdef" }))
  const payload = await response.json()

  assert.equal(response.status, 403)
  assert.equal(payload.code, "ACTIVE_SUBSCRIPTION_REQUIRED")
  assert.equal(stripeTouched, false)
})

test("Android WebView billing surface is blocked before Stripe checkout", async () => {
  let authorized = false
  const handler = createCreditTopupCheckoutHandler({
    authorize: async () => {
      authorized = true
      return principal
    },
  })

  const response = await handler(
    request(
      { pack: "100", requestId: "request_1234567890abcdef" },
      "Mozilla/5.0 (Linux; Android 16; SM-S731U Build/ABC; wv) AppleWebKit/537.36 Version/4.0 Chrome/140.0 Mobile Safari/537.36",
    ),
  )
  const payload = await response.json()

  assert.equal(response.status, 403)
  assert.equal(payload.code, "CREDIT_TOPUP_UNAVAILABLE_IN_PLAY_WEBVIEW")
  assert.equal(authorized, false)
})

test("top-up request rejects unknown packs, malformed request IDs, and extra fields", async () => {
  const handler = createCreditTopupCheckoutHandler({ authorize: async () => principal })

  for (const body of [
    { pack: "500", requestId: "request_1234567890abcdef" },
    { pack: "100", requestId: "short" },
    { pack: "100", requestId: "request_1234567890abcdef", units: 999_999 },
  ]) {
    const response = await handler(request(body))
    const payload = await response.json()
    assert.equal(response.status, 400)
    assert.equal(payload.code, "INVALID_CREDIT_TOPUP_REQUEST")
  }
})
