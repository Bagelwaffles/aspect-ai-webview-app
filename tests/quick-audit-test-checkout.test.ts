import assert from "node:assert/strict"
import test from "node:test"

import { NextRequest } from "next/server"
import type Stripe from "stripe"

import { createQuickAuditTestCheckoutHandler } from "../lib/server/quick-audit-test-checkout"

const adminSecret = "a".repeat(40)

function request(cookie = "valid-admin-token") {
  return new NextRequest("https://www.aspectmarketingsolutions.app/api/internal/quick-audit-test/checkout", {
    method: "POST",
    headers: {
      cookie: `ams_internal_admin_access=${cookie}`,
      "content-type": "application/json",
    },
    body: "{}",
  })
}

function testEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    INTERNAL_ADMIN_SECRET: adminSecret,
    AMS_STRIPE_QUICK_AUDIT_SECRET_KEY: "sk_test_fixture",
    AMS_STRIPE_QUICK_AUDIT_PRICE_ID: "price_test_fixture",
    PUBLIC_APP_URL: "https://www.aspectmarketingsolutions.app",
    ...overrides,
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
