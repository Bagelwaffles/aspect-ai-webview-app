import assert from "node:assert/strict"
import test from "node:test"

import { NextRequest } from "next/server"

import { POST } from "../app/api/ethical-agent-farm/offer-request/route"

type RouteTestGlobals = typeof globalThis & {
  __amsOfferRequestTestDependencies?: {
    env?: NodeJS.ProcessEnv
    fetchImpl?: typeof fetch
    timeoutMs?: number
  }
}

const routeTestGlobals = globalThis as RouteTestGlobals

const productionEnv = {
  NODE_ENV: "production",
  AMS_BACKEND_URL: "https://backend.example.com",
  AMS_STRIPE_FULFILLMENT_SECRET: "test-secret-not-production",
} as NodeJS.ProcessEnv

const validRequest = {
  name: "Test Owner",
  email: "  OWNER@Example.COM  ",
  businessName: "Test Business",
  websiteOrFacebook: "https://example.com",
  selectedOffer: "quick-marketing-audit",
  notesOrGoals: "Review the current marketing plan.",
  consent: true,
}

function request(body: unknown) {
  return new NextRequest("http://localhost/api/ethical-agent-farm/offer-request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function setDependencies(dependencies: RouteTestGlobals["__amsOfferRequestTestDependencies"]) {
  routeTestGlobals.__amsOfferRequestTestDependencies = dependencies
}

test.afterEach(() => {
  delete routeTestGlobals.__amsOfferRequestTestDependencies
})

test("rejects unknown offers, oversized fields, and unrecognized input", async () => {
  let fetchCalls = 0
  setDependencies({
    env: productionEnv,
    fetchImpl: async () => {
      fetchCalls += 1
      return new Response(null, { status: 200 })
    },
  })

  const cases = [
    { ...validRequest, selectedOffer: "unapproved-offer" },
    { ...validRequest, name: "x".repeat(121) },
    { ...validRequest, notesOrGoals: "x".repeat(2_001) },
    { ...validRequest, paymentToken: "must-not-be-accepted" },
    { ...validRequest, consent: false },
  ]

  for (const body of cases) {
    const response = await POST(request(body))
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), {
      ok: false,
      saved: false,
      error: "invalid_service_request",
    })
  }

  assert.equal(fetchCalls, 0)
})

test("requires explicit server-only backend configuration", async () => {
  let fetchCalls = 0
  setDependencies({
    env: {
      NODE_ENV: "production",
      NEXT_PUBLIC_API_BASE_URL: "https://public-target.example.com",
      AMS_STRIPE_FULFILLMENT_SECRET: "test-secret-not-production",
    } as NodeJS.ProcessEnv,
    fetchImpl: async () => {
      fetchCalls += 1
      return new Response(null, { status: 200 })
    },
  })

  const response = await POST(request(validRequest))
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error, "service_request_unavailable")
  assert.equal(fetchCalls, 0)
})

test("rejects insecure and private production backend targets", async () => {
  let fetchCalls = 0
  const unsafeTargets = [
    "http://backend.example.com",
    "https://localhost:4000",
    "https://127.0.0.1",
    "https://10.1.2.3",
    "https://192.168.1.25",
    "https://service.internal",
  ]

  for (const target of unsafeTargets) {
    setDependencies({
      env: { ...productionEnv, AMS_BACKEND_URL: target } as NodeJS.ProcessEnv,
      fetchImpl: async () => {
        fetchCalls += 1
        return new Response(null, { status: 200 })
      },
    })

    const response = await POST(request(validRequest))
    assert.equal(response.status, 503, target)
    assert.equal((await response.json()).error, "service_request_unavailable", target)
  }

  assert.equal(fetchCalls, 0)
})

test("normalizes input and returns only the fixed success contract", async () => {
  let forwardedUrl = ""
  let forwardedSecret = ""
  let forwardedBody: Record<string, unknown> | null = null

  setDependencies({
    env: productionEnv,
    fetchImpl: async (input, init) => {
      forwardedUrl = input.toString()
      forwardedSecret = new Headers(init?.headers).get("x-ams-fulfillment-secret") ?? ""
      forwardedBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      assert.ok(init?.signal)
      return new Response(
        JSON.stringify({ ok: true, message: "raw upstream text", secret: "must-not-leak" }),
        { status: 201, headers: { "content-type": "application/json" } },
      )
    },
  })

  const response = await POST(request(validRequest))
  const result = await response.json()

  assert.equal(response.status, 200)
  assert.equal(response.headers.get("cache-control"), "no-store")
  assert.deepEqual(result, {
    ok: true,
    saved: true,
    message: "Request received. We'll review your business and follow up.",
    noPaymentCharged: true,
  })
  assert.equal(forwardedUrl, "https://backend.example.com/internal/ethical-agent-farm/requests")
  assert.equal(forwardedSecret, "test-secret-not-production")
  assert.deepEqual(forwardedBody, {
    name: "Test Owner",
    email: "owner@example.com",
    businessName: "Test Business",
    websiteOrFacebook: "https://example.com",
    selectedOffer: "quick-marketing-audit",
    notes: "Review the current marketing plan.",
    consent: true,
  })
  assert.equal(JSON.stringify(result).includes("raw upstream text"), false)
  assert.equal(JSON.stringify(result).includes("must-not-leak"), false)
})

test("does not relay upstream response bodies or thrown error messages", async () => {
  setDependencies({
    env: productionEnv,
    fetchImpl: async () =>
      new Response("sensitive upstream diagnostic", { status: 500 }),
  })

  const failedResponse = await POST(request(validRequest))
  const failedResult = await failedResponse.json()
  assert.equal(failedResponse.status, 502)
  assert.equal(failedResult.error, "service_request_upstream_failed")
  assert.equal(JSON.stringify(failedResult).includes("sensitive upstream diagnostic"), false)

  setDependencies({
    env: productionEnv,
    fetchImpl: async () => {
      throw new Error("private network failure details")
    },
  })

  const thrownResponse = await POST(request(validRequest))
  const thrownResult = await thrownResponse.json()
  assert.equal(thrownResponse.status, 502)
  assert.equal(thrownResult.error, "service_request_upstream_failed")
  assert.equal(JSON.stringify(thrownResult).includes("private network failure details"), false)
})

test("aborts a slow upstream request with a controlled response", async () => {
  setDependencies({
    env: productionEnv,
    timeoutMs: 5,
    fetchImpl: async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("abort details")), {
          once: true,
        })
      }),
  })

  const response = await POST(request(validRequest))
  const result = await response.json()
  assert.equal(response.status, 504)
  assert.equal(result.error, "service_request_upstream_timeout")
  assert.equal(JSON.stringify(result).includes("abort details"), false)
})
