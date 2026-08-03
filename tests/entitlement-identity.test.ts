import assert from "node:assert/strict"
import test from "node:test"

import { NextRequest } from "next/server"
import type Stripe from "stripe"

import { POST as checkoutPost } from "../app/api/billing/checkout/route"
import { POST as portalPost } from "../app/api/billing/portal/route"
import { customerSubjectFromProviderSubject } from "../lib/auth"
import type { EntitlementSnapshot } from "../lib/server/entitlements"

const subject = customerSubjectFromProviderSubject("checkout-customer-provider-subject")
if (!subject) throw new Error("Stable test subject is required")

const customer = {
  kind: "customer" as const,
  subject,
  billingEmail: "billing@example.com",
  email: "billing@example.com",
}

const snapshot: EntitlementSnapshot = {
  configured: true,
  subject,
  billingEmail: customer.billingEmail,
  plan: "starter",
  subscriptionStatus: "active",
  planCredits: 2000,
  topupCredits: 0,
  totalCredits: 2000,
  agentSlugs: [],
  stripeCustomerId: "cus_subject_owned",
  stripeSubscriptionId: "sub_subject_owned",
}

type RouteTestGlobals = typeof globalThis & {
  __amsCheckoutTestDependencies?: unknown
  __amsPortalTestDependencies?: unknown
}

const routeTestGlobals = globalThis as RouteTestGlobals

function checkoutRequest(body: unknown) {
  return new NextRequest("http://127.0.0.1:3000/api/billing/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function portalRequest() {
  return new NextRequest("http://127.0.0.1:3000/api/billing/portal", { method: "POST" })
}

function checkoutEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    PUBLIC_APP_URL: "https://www.aspectmarketingsolutions.app",
    AMS_STRIPE_WEBHOOK_MODE: "test",
    STRIPE_SECRET_KEY: "sk_test_fixture_only",
    AMS_STRIPE_STARTER_PRICE_ID: "price_starter_approved",
    ...overrides,
  } as NodeJS.ProcessEnv
}

test.afterEach(() => {
  delete routeTestGlobals.__amsCheckoutTestDependencies
  delete routeTestGlobals.__amsPortalTestDependencies
})

test("checkout derives stable identity, billing contact, price, and return URLs server-side", async () => {
  let createdWith: Stripe.Checkout.SessionCreateParams | undefined
  routeTestGlobals.__amsCheckoutTestDependencies = {
    authorize: async () => customer,
    env: checkoutEnv(),
    createSession: async (_secretKey: string, params: Stripe.Checkout.SessionCreateParams) => {
      createdWith = params
      return { id: "cs_test_subject", url: "https://checkout.stripe.test/session" }
    },
  }

  const response = await checkoutPost(checkoutRequest({ plan: "starter" }))
  assert.equal(response.status, 200)
  assert.equal(createdWith?.mode, "subscription")
  assert.equal(createdWith?.customer_email, customer.billingEmail)
  assert.equal(createdWith?.client_reference_id, subject)
  assert.deepEqual(createdWith?.line_items, [{ price: "price_starter_approved", quantity: 1 }])
  assert.equal(createdWith?.metadata?.customerSubject, subject)
  assert.equal(createdWith?.metadata?.userEmail, customer.billingEmail)
  assert.equal(createdWith?.subscription_data?.metadata?.customerSubject, subject)
  assert.equal(
    createdWith?.success_url,
    "https://www.aspectmarketingsolutions.app/billing/success?session_id={CHECKOUT_SESSION_ID}",
  )
  assert.equal(createdWith?.cancel_url, "https://www.aspectmarketingsolutions.app/billing")
})

test("checkout rejects body-supplied identity, price, or return URL fields", async () => {
  let stripeCalls = 0
  routeTestGlobals.__amsCheckoutTestDependencies = {
    authorize: async () => customer,
    env: checkoutEnv(),
    createSession: async () => {
      stripeCalls += 1
      return { id: "unexpected", url: null }
    },
  }

  for (const extra of [
    { customerSubject: subject },
    { email: "other@example.com" },
    { price: "price_untrusted" },
    { successUrl: "https://untrusted.example/success" },
  ]) {
    const response = await checkoutPost(checkoutRequest({ plan: "starter", ...extra }))
    assert.equal(response.status, 400)
    assert.equal((await response.json()).code, "INVALID_CHECKOUT_REQUEST")
  }
  assert.equal(stripeCalls, 0)
})

test("checkout rejects Stripe secret keys that do not match staging mode before SDK use", async (context) => {
  for (const candidate of [
    {
      name: "default test mode with live key",
      env: checkoutEnv({ AMS_STRIPE_WEBHOOK_MODE: undefined, STRIPE_SECRET_KEY: "sk_live_fixture_only" }),
    },
    {
      name: "live mode with test key",
      env: checkoutEnv({ AMS_STRIPE_WEBHOOK_MODE: "live", STRIPE_SECRET_KEY: "sk_test_fixture_only" }),
    },
  ]) {
    await context.test(candidate.name, async () => {
      let stripeCalls = 0
      routeTestGlobals.__amsCheckoutTestDependencies = {
        authorize: async () => customer,
        env: candidate.env,
        createSession: async () => {
          stripeCalls += 1
          return { id: "unexpected", url: null }
        },
      }

      const response = await checkoutPost(checkoutRequest({ plan: "starter" }))
      assert.equal(response.status, 503)
      assert.equal((await response.json()).code, "SUBSCRIPTION_CHECKOUT_NOT_CONFIGURED")
      assert.equal(stripeCalls, 0)
    })
  }
})

test("production checkout fails closed without a valid HTTPS PUBLIC_APP_URL", async (context) => {
  for (const candidate of [
    checkoutEnv({ PUBLIC_APP_URL: undefined }),
    checkoutEnv({ PUBLIC_APP_URL: "http://www.aspectmarketingsolutions.app" }),
    checkoutEnv({ PUBLIC_APP_URL: "https://localhost:3000" }),
  ]) {
    await context.test(candidate.PUBLIC_APP_URL ?? "missing", async () => {
      let stripeCalls = 0
      routeTestGlobals.__amsCheckoutTestDependencies = {
        authorize: async () => customer,
        env: candidate,
        createSession: async () => {
          stripeCalls += 1
          return { id: "unexpected", url: null }
        },
      }

      const response = await checkoutPost(checkoutRequest({ plan: "starter" }))
      assert.equal(response.status, 503)
      assert.equal(stripeCalls, 0)
    })
  }
})

test("billing portal uses the subject-owned Stripe customer and production app URL", async () => {
  let entitlementSubject = ""
  let portalInput: Stripe.BillingPortal.SessionCreateParams | undefined
  routeTestGlobals.__amsPortalTestDependencies = {
    authorize: async () => customer,
    getEntitlements: async (candidate: string) => {
      entitlementSubject = candidate
      return snapshot
    },
    env: checkoutEnv(),
    createPortalSession: async (
      _secretKey: string,
      params: Stripe.BillingPortal.SessionCreateParams,
    ) => {
      portalInput = params
      return { url: "https://billing.stripe.test/session" }
    },
  }

  const response = await portalPost(portalRequest())
  assert.equal(response.status, 200)
  assert.equal(entitlementSubject, subject)
  assert.equal(portalInput?.customer, snapshot.stripeCustomerId)
  assert.equal(portalInput?.return_url, "https://www.aspectmarketingsolutions.app/billing")
})
