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

const inactiveSnapshot: EntitlementSnapshot = {
  ...snapshot,
  plan: null,
  subscriptionStatus: "inactive",
  planCredits: 0,
  totalCredits: 0,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
}

const checkoutNow = Date.parse("2026-08-03T12:00:00.000Z")
const checkoutExpiresAt = checkoutNow + 60 * 60 * 1000

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

function checkoutDependencies(overrides: Record<string, unknown> = {}) {
  return {
    authorize: async () => customer,
    getEntitlements: async () => inactiveSnapshot,
    claimIntent: async () => ({
      state: "claimed" as const,
      token: "intent-token",
      idempotencyKey: "ams-checkout-idempotency-fixture",
      expiresAt: checkoutExpiresAt,
    }),
    completeIntent: async () => undefined,
    releaseIntent: async () => undefined,
    env: checkoutEnv(),
    now: () => checkoutNow,
    createSession: async () => ({
      id: "cs_test_subject",
      url: "https://checkout.stripe.test/session",
    }),
    ...overrides,
  }
}

test.afterEach(() => {
  delete routeTestGlobals.__amsCheckoutTestDependencies
  delete routeTestGlobals.__amsPortalTestDependencies
})

test("checkout derives stable identity, billing contact, price, and return URLs server-side", async () => {
  let createdWith: Stripe.Checkout.SessionCreateParams | undefined
  let requestOptions: Stripe.RequestOptions | undefined
  let completed = false
  routeTestGlobals.__amsCheckoutTestDependencies = checkoutDependencies({
    createSession: async (
      _secretKey: string,
      params: Stripe.Checkout.SessionCreateParams,
      options: Stripe.RequestOptions,
    ) => {
      createdWith = params
      requestOptions = options
      return { id: "cs_test_subject", url: "https://checkout.stripe.test/session" }
    },
    completeIntent: async () => {
      completed = true
    },
  })

  const response = await checkoutPost(checkoutRequest({ plan: "starter" }))
  assert.equal(response.status, 200)
  assert.equal(createdWith?.mode, "subscription")
  assert.equal(createdWith?.customer_email, customer.billingEmail)
  assert.equal(createdWith?.customer, undefined)
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
  assert.equal(createdWith?.expires_at, Math.floor(checkoutExpiresAt / 1000))
  assert.equal(requestOptions?.idempotencyKey, "ams-checkout-idempotency-fixture")
  assert.equal(completed, true)
})

test("checkout rejects body-supplied identity, price, or return URL fields", async () => {
  let stripeCalls = 0
  routeTestGlobals.__amsCheckoutTestDependencies = checkoutDependencies({
    createSession: async () => {
      stripeCalls += 1
      return { id: "unexpected", url: null }
    },
  })

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
      routeTestGlobals.__amsCheckoutTestDependencies = checkoutDependencies({
        env: candidate.env,
        createSession: async () => {
          stripeCalls += 1
          return { id: "unexpected", url: null }
        },
      })

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
      routeTestGlobals.__amsCheckoutTestDependencies = checkoutDependencies({
        env: candidate,
        createSession: async () => {
          stripeCalls += 1
          return { id: "unexpected", url: null }
        },
      })

      const response = await checkoutPost(checkoutRequest({ plan: "starter" }))
      assert.equal(response.status, 503)
      assert.equal(stripeCalls, 0)
    })
  }
})

test("checkout reuses the subject-owned Stripe customer", async () => {
  let createdWith: Stripe.Checkout.SessionCreateParams | undefined
  routeTestGlobals.__amsCheckoutTestDependencies = checkoutDependencies({
    getEntitlements: async () => ({
      ...inactiveSnapshot,
      subscriptionStatus: "past_due" as const,
      stripeCustomerId: "cus_existing_subject",
    }),
    createSession: async (
      _secretKey: string,
      params: Stripe.Checkout.SessionCreateParams,
    ) => {
      createdWith = params
      return { id: "cs_existing_customer", url: "https://checkout.stripe.test/existing" }
    },
  })

  const response = await checkoutPost(checkoutRequest({ plan: "starter" }))
  assert.equal(response.status, 200)
  assert.equal(createdWith?.customer, "cus_existing_subject")
  assert.equal(createdWith?.customer_email, undefined)
})

test("checkout rejects active and trialing accounts before intent or Stripe work", async (context) => {
  for (const subscriptionStatus of ["active", "trialing"] as const) {
    await context.test(subscriptionStatus, async () => {
      let intentCalls = 0
      let stripeCalls = 0
      routeTestGlobals.__amsCheckoutTestDependencies = checkoutDependencies({
        getEntitlements: async () => ({ ...snapshot, subscriptionStatus }),
        claimIntent: async () => {
          intentCalls += 1
          return { state: "active_subscription" as const }
        },
        createSession: async () => {
          stripeCalls += 1
          return { id: "unexpected", url: null }
        },
      })

      const response = await checkoutPost(checkoutRequest({ plan: "starter" }))
      const body = await response.json()
      assert.equal(response.status, 409)
      assert.equal(body.code, "SUBSCRIPTION_ALREADY_ACTIVE")
      assert.equal(intentCalls, 0)
      assert.equal(stripeCalls, 0)
    })
  }
})

test("checkout rejects an entitlement activated atomically during intent claim", async () => {
  let stripeCalls = 0
  routeTestGlobals.__amsCheckoutTestDependencies = checkoutDependencies({
    getEntitlements: async () => inactiveSnapshot,
    claimIntent: async () => ({ state: "active_subscription" as const }),
    createSession: async () => {
      stripeCalls += 1
      return { id: "unexpected", url: null }
    },
  })

  const response = await checkoutPost(checkoutRequest({ plan: "starter" }))
  const body = await response.json()
  assert.equal(response.status, 409)
  assert.equal(body.code, "SUBSCRIPTION_ALREADY_ACTIVE")
  assert.equal(stripeCalls, 0)
})

test("checkout returns the durable open session without creating a duplicate", async () => {
  let stripeCalls = 0
  let completionCalls = 0
  routeTestGlobals.__amsCheckoutTestDependencies = checkoutDependencies({
    claimIntent: async () => ({
      state: "open" as const,
      sessionId: "cs_existing_open",
      url: "https://checkout.stripe.test/open",
      expiresAt: checkoutExpiresAt,
    }),
    createSession: async () => {
      stripeCalls += 1
      return { id: "unexpected", url: null }
    },
    completeIntent: async () => {
      completionCalls += 1
    },
  })

  const response = await checkoutPost(checkoutRequest({ plan: "starter" }))
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.sessionId, "cs_existing_open")
  assert.equal(body.url, "https://checkout.stripe.test/open")
  assert.equal(body.idempotent, true)
  assert.equal(stripeCalls, 0)
  assert.equal(completionCalls, 0)
})

test("checkout releases a claimed intent after Stripe creation fails", async () => {
  let releasedToken = ""
  routeTestGlobals.__amsCheckoutTestDependencies = checkoutDependencies({
    createSession: async () => {
      throw new Error("simulated Stripe outage")
    },
    releaseIntent: async (input: { token: string }) => {
      releasedToken = input.token
    },
  })

  const response = await checkoutPost(checkoutRequest({ plan: "starter" }))
  assert.equal(response.status, 502)
  assert.equal(releasedToken, "intent-token")
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
