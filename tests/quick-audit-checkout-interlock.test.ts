import assert from "node:assert/strict"
import test from "node:test"

import { NextRequest } from "next/server"

import { createQuickAuditCheckoutHandler } from "../lib/server/quick-audit-checkout"

const requestBody = {
  businessName: "Example",
  websiteUrl: "https://example.com",
  industry: "Services",
  goals: "More leads",
  notes: "",
}

function request() {
  return new NextRequest("https://www.aspectmarketingsolutions.app/api/quick-marketing-audit/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestBody),
  })
}

test("production Quick Audit checkout fails closed when fulfillment is not explicitly ready", async () => {
  let createCalls = 0
  const handler = createQuickAuditCheckoutHandler({
    env: {
      NODE_ENV: "production",
      AMS_QUICK_AUDIT_PUBLIC_SALES_ENABLED: "true",
      AMS_STRIPE_QUICK_AUDIT_LIVE_SECRET_KEY: "rk_live_fixture",
      AMS_STRIPE_QUICK_AUDIT_LIVE_PRICE_ID: "price_fixture",
      PUBLIC_APP_URL: "https://www.aspectmarketingsolutions.app",
    },
    createSession: async () => {
      createCalls += 1
      return { id: "unexpected", url: "https://checkout.stripe.test/unexpected" }
    },
  })

  const response = await handler(request())
  const body = await response.json()

  assert.equal(response.status, 503)
  assert.equal(body.code, "QUICK_AUDIT_FULFILLMENT_UNAVAILABLE")
  assert.equal(createCalls, 0)
})

test("production Quick Audit checkout proceeds only after fulfillment readiness is explicit", async () => {
  let createCalls = 0
  const handler = createQuickAuditCheckoutHandler({
    env: {
      NODE_ENV: "production",
      AMS_QUICK_AUDIT_PUBLIC_SALES_ENABLED: "true",
      AMS_QUICK_AUDIT_FULFILLMENT_READY: "true",
      AMS_STRIPE_QUICK_AUDIT_LIVE_SECRET_KEY: "rk_live_fixture",
      AMS_STRIPE_QUICK_AUDIT_LIVE_PRICE_ID: "price_fixture",
      PUBLIC_APP_URL: "https://www.aspectmarketingsolutions.app",
    },
    idFactory: () => "fixture",
    createSession: async () => {
      createCalls += 1
      return { id: "cs_fixture", url: "https://checkout.stripe.test/session" }
    },
  })

  const response = await handler(request())
  assert.equal(response.status, 200)
  assert.equal(createCalls, 1)
})
