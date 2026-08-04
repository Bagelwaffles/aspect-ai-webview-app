import assert from "node:assert/strict"
import test from "node:test"

import { NextRequest } from "next/server"

import { POST as aiChatPost } from "../app/api/ai/chat/route"
import { GET as grokAgentsGet } from "../app/api/grok/agents/route"
import { POST as grokChatPost } from "../app/api/grok/chat/route"
import { POST as grokStreamPost } from "../app/api/grok/stream/route"
import { customerSubjectFromProviderSubject } from "../lib/auth"

const stableCustomerSubject = customerSubjectFromProviderSubject("paid-customer-provider-subject")
if (!stableCustomerSubject) throw new Error("Test customer subject could not be derived")

const customer = {
  kind: "customer" as const,
  subject: stableCustomerSubject,
  billingEmail: "owner@example.com",
  email: "owner@example.com",
}

const snapshot = {
  configured: true,
  subject: customer.subject,
  billingEmail: customer.billingEmail,
  plan: "starter",
  subscriptionStatus: "active",
  planCredits: 10,
  topupCredits: 0,
  totalCredits: 10,
  agentSlugs: [],
  stripeCustomerId: "cus_test",
  stripeSubscriptionId: "sub_test",
}

type RouteTestGlobals = typeof globalThis & {
  __amsAiChatTestDependencies?: unknown
  __amsGrokChatTestDependencies?: unknown
  __amsGrokStreamTestDependencies?: unknown
  __amsGrokAgentsTestDependencies?: unknown
}

const routeTestGlobals = globalThis as RouteTestGlobals

function createAiChatHandler(dependencies: Record<string, unknown>) {
  routeTestGlobals.__amsAiChatTestDependencies = dependencies
  return aiChatPost
}

function createGrokChatHandler(dependencies: Record<string, unknown>) {
  routeTestGlobals.__amsGrokChatTestDependencies = dependencies
  return grokChatPost
}

function createGrokStreamHandler(dependencies: Record<string, unknown>) {
  routeTestGlobals.__amsGrokStreamTestDependencies = dependencies
  return grokStreamPost
}

function createGrokAgentsHandler(dependencies: Record<string, unknown>) {
  routeTestGlobals.__amsGrokAgentsTestDependencies = dependencies
  return grokAgentsGet
}

function request(path: string, body?: unknown, idempotencyKey = "operation-1234") {
  return new NextRequest(`http://127.0.0.1:3000${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined
      ? undefined
      : {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

test("legacy paid AI chat route keeps unauthenticated callers out", async () => {
  const handler = createAiChatHandler({ authorize: async () => null })

  const response = await handler(request("/api/ai/chat", { message: "Create a launch outline" }))
  const body = await response.json()

  assert.equal(response.status, 401)
  assert.equal(body.code, "CUSTOMER_SESSION_REQUIRED")
})

test("legacy paid AI chat route is disabled before credit or provider work", async () => {
  const events: string[] = []
  const handler = createAiChatHandler({
    authorize: async () => {
      events.push("authorize")
      return customer
    },
    reserve: async () => events.push("reserve"),
    commit: async () => events.push("commit"),
    refund: async () => events.push("refund"),
    runProvider: async () => events.push("provider"),
  })

  const response = await handler(request("/api/ai/chat", { message: "Create a launch outline" }))
  const body = await response.json()

  assert.equal(response.status, 410)
  assert.equal(body.code, "LEGACY_AI_ROUTE_DISABLED")
  assert.equal(body.next, "/content-agent")
  assert.deepEqual(events, ["authorize"])
})

test("legacy Grok chat route keeps unauthenticated callers out", async () => {
  const handler = createGrokChatHandler({ authorize: async () => null })

  const response = await handler(
    request("/api/grok/chat", { agentId: "grok-content", message: "Draft content" }),
  )
  const body = await response.json()

  assert.equal(response.status, 401)
  assert.equal(body.code, "CUSTOMER_SESSION_REQUIRED")
})

test("legacy Grok chat route is disabled before credit or provider work", async () => {
  const events: string[] = []
  const handler = createGrokChatHandler({
    authorize: async () => {
      events.push("authorize")
      return customer
    },
    reserve: async () => events.push("reserve"),
    commit: async () => events.push("commit"),
    refund: async () => events.push("refund"),
    runProvider: async () => events.push("provider"),
  })

  const response = await handler(
    request("/api/grok/chat", { agentId: "grok-content", message: "Draft content" }),
  )
  const body = await response.json()

  assert.equal(response.status, 410)
  assert.equal(body.code, "LEGACY_AI_ROUTE_DISABLED")
  assert.equal(body.next, "/content-agent")
  assert.deepEqual(events, ["authorize"])
})

test("streaming is customer-authenticated and disabled with a controlled 501", async () => {
  const customerHandler = createGrokStreamHandler({ authorize: async () => customer })
  const customerResponse = await customerHandler(
    request("/api/grok/stream", { agentId: "grok-content", message: "Draft content" }),
  )
  const customerBody = await customerResponse.json()
  assert.equal(customerResponse.status, 501)
  assert.equal(customerBody.code, "STREAMING_NOT_IMPLEMENTED")

  const internalHandler = createGrokStreamHandler({
    authorize: async () => ({ kind: "internal" as const, subject: "internal-api" }),
  })
  const internalResponse = await internalHandler(
    request("/api/grok/stream", { agentId: "grok-content", message: "Draft content" }),
  )
  assert.equal(internalResponse.status, 401)
})

test("Grok agent catalog requires a customer session and exposes only Content", async () => {
  const unauthenticated = await createGrokAgentsHandler({ authorize: async () => null })(
    request("/api/grok/agents"),
  )
  assert.equal(unauthenticated.status, 401)

  const authenticated = await createGrokAgentsHandler({
    authorize: async () => customer,
    getEntitlements: async () => snapshot,
    hasAgentAccess: () => true,
  })(request("/api/grok/agents"))
  const body = await authenticated.json()
  assert.equal(authenticated.status, 200)
  assert.deepEqual(
    body.agents.map((agent: { id: string }) => agent.id),
    ["grok-content"],
  )
})
