import assert from "node:assert/strict"
import test from "node:test"

import { NextRequest } from "next/server"

import { POST as checkoutPost } from "../app/api/billing/checkout/route"
import { POST as contentAgentPost } from "../app/api/content-agent/runs/route"
import { customerSubjectFromProviderSubject } from "../lib/auth"

const subject = customerSubjectFromProviderSubject("zero-cost-launch-customer")
if (!subject) throw new Error("Stable test subject is required")

const customer = {
  kind: "customer" as const,
  subject,
  billingEmail: "zero-cost@example.com",
  email: "zero-cost@example.com",
}

type RouteTestGlobals = typeof globalThis & {
  __amsCheckoutTestDependencies?: Record<string, unknown>
  __amsContentAgentTestDependencies?: Record<string, unknown>
}

const routeTestGlobals = globalThis as RouteTestGlobals

test.afterEach(() => {
  delete routeTestGlobals.__amsCheckoutTestDependencies
  delete routeTestGlobals.__amsContentAgentTestDependencies
})

test("zero-cost launch pauses paid checkout before entitlement, intent, or Stripe work", async () => {
  const events: string[] = []
  routeTestGlobals.__amsCheckoutTestDependencies = {
    authorize: async () => {
      events.push("authorize")
      return customer
    },
    launchEnabled: () => false,
    getEntitlements: async () => {
      events.push("entitlements")
      throw new Error("must not run")
    },
    claimIntent: async () => {
      events.push("intent")
      throw new Error("must not run")
    },
    createSession: async () => {
      events.push("stripe")
      throw new Error("must not run")
    },
  }

  const response = await checkoutPost(
    new NextRequest("http://127.0.0.1:3000/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: "starter" }),
    }),
  )
  const body = await response.json()

  assert.equal(response.status, 503)
  assert.equal(body.code, "SUBSCRIPTION_CHECKOUT_PAUSED")
  assert.match(body.error, /No charge was created/i)
  assert.deepEqual(events, ["authorize"])
})

test("zero-cost launch rejects Content Agent execution before entitlement or credit work", async () => {
  const events: string[] = []
  routeTestGlobals.__amsContentAgentTestDependencies = {
    authorize: async () => {
      events.push("authorize")
      return customer
    },
    rateLimit: async () => {
      events.push("rate-limit")
      return {
        allowed: true,
        available: true,
        code: "OK",
        limit: 10,
        remaining: 9,
        resetAt: Date.now() + 60_000,
        retryAfterSeconds: 60,
        distributed: true,
      }
    },
    providerConfigured: () => false,
    getEntitlements: async () => {
      events.push("entitlements")
      throw new Error("must not run")
    },
    reserve: async () => {
      events.push("reserve")
      throw new Error("must not run")
    },
    runProvider: async () => {
      events.push("provider")
      throw new Error("must not run")
    },
  }

  const response = await contentAgentPost(
    new NextRequest("http://127.0.0.1:3000/api/content-agent/runs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "zero-cost-content-0001",
      },
      body: JSON.stringify({
        businessName: "Aspect Marketing Solutions",
        audience: "Small business owners",
        goal: "Join the private beta waitlist",
        channel: "website",
        tone: "professional",
      }),
    }),
  )
  const body = await response.json()

  assert.equal(response.status, 503)
  assert.equal(body.code, "CONTENT_AGENT_NOT_CONFIGURED")
  assert.equal(JSON.stringify(body).includes("403"), false)
  assert.deepEqual(events, ["authorize", "rate-limit"])
})
