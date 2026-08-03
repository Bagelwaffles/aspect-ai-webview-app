import assert from "node:assert/strict"
import test from "node:test"

import { NextRequest } from "next/server"

import { POST as aiChatPost } from "../app/api/ai/chat/route"
import { GET as grokAgentsGet } from "../app/api/grok/agents/route"
import { POST as grokChatPost } from "../app/api/grok/chat/route"
import { POST as grokStreamPost } from "../app/api/grok/stream/route"
import { customerSubjectFromProviderSubject } from "../lib/auth"
import { grokAgentManager } from "../lib/grok-agents"
import type { CreditFinalizationResult, CreditReservationResult } from "../lib/server/credit-ledger"
import type { EntitlementSnapshot } from "../lib/server/entitlements"
import type {
  DistributedAiRateLimitInput,
  DistributedAiRateLimitResult,
} from "../lib/server/rate-limit"

const stableCustomerSubject = customerSubjectFromProviderSubject("paid-customer-provider-subject")
if (!stableCustomerSubject) throw new Error("Test customer subject could not be derived")

const customer = {
  kind: "customer" as const,
  subject: stableCustomerSubject,
  billingEmail: "owner@example.com",
  email: "owner@example.com",
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

const snapshot: EntitlementSnapshot = {
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

function reservation(
  state: CreditReservationResult["state"] = "reserved",
  idempotent = false,
): CreditReservationResult {
  return {
    reservationId: "reservation-1",
    amount: 1,
    planUnits: state === "rejected" ? 0 : 1,
    topupUnits: 0,
    state,
    reserved: state !== "rejected",
    idempotent,
    planCredits: 9,
    topupCredits: 0,
    totalCredits: 9,
  }
}

function terminal(state: CreditFinalizationResult["state"]): CreditFinalizationResult {
  return {
    reservationId: "reservation-1",
    amount: 1,
    planUnits: 1,
    topupUnits: 0,
    state,
    idempotent: false,
    planCredits: state === "refunded" ? 10 : 9,
    topupCredits: 0,
    totalCredits: state === "refunded" ? 10 : 9,
  }
}

function rateLimitResult(
  overrides: Partial<DistributedAiRateLimitResult> = {},
): DistributedAiRateLimitResult {
  return {
    allowed: true,
    available: true,
    code: "OK",
    limit: 10,
    remaining: 9,
    resetAt: Date.now() + 60_000,
    retryAfterSeconds: 60,
    distributed: true,
    ...overrides,
  }
}

async function allowedRateLimit() {
  return rateLimitResult()
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

function baseAiDependencies(events: string[]) {
  return {
    authorize: async () => customer,
    getEntitlements: async () => snapshot,
    hasAgentAccess: () => true,
    reserve: async () => {
      events.push("reserve")
      return reservation()
    },
    commit: async () => {
      events.push("commit")
      return terminal("committed")
    },
    refund: async () => {
      events.push("refund")
      return terminal("refunded")
    },
    rateLimit: allowedRateLimit,
    generateOperationId: () => "server-operation-1234",
    getProviderModel: () => "test-model",
    runProvider: async () => {
      events.push("provider")
      return "Validated provider response"
    },
  }
}

function baseGrokDependencies(events: string[]) {
  return {
    ...baseAiDependencies(events),
    getAgent: (agentId: string) => grokAgentManager.getAgent(agentId),
  }
}

test("AI chat rejects an internal bearer principal before entitlement, reservation, or provider work", async () => {
  const events: string[] = []
  const handler = createAiChatHandler({
    ...baseAiDependencies(events),
    authorize: async () => ({ kind: "internal" as const, subject: "internal-api" }),
  })

  const response = await handler(request("/api/ai/chat", { message: "Create a launch outline" }))
  const body = await response.json()

  assert.equal(response.status, 401)
  assert.equal(body.code, "CUSTOMER_SESSION_REQUIRED")
  assert.deepEqual(events, [])
})

test("AI chat validates body and idempotency key before reserving", async () => {
  const events: string[] = []
  const handler = createAiChatHandler(baseAiDependencies(events))

  const invalidBody = await handler(request("/api/ai/chat", { message: "   " }))
  assert.equal(invalidBody.status, 400)
  assert.deepEqual(events, [])

  const invalidKey = await handler(
    request("/api/ai/chat", { message: "Valid message" }, "bad key with spaces"),
  )
  assert.equal(invalidKey.status, 400)
  assert.deepEqual(events, [])
})

test("customer chat routes use stable subjects with server-fixed distributed operations", async (context) => {
  await context.test("AI chat", async () => {
    const events: string[] = []
    let input: DistributedAiRateLimitInput | undefined
    let entitlementSubject = ""
    let reserveInput: Record<string, unknown> | undefined
    let commitInput: Record<string, unknown> | undefined
    const handler = createAiChatHandler({
      ...baseAiDependencies(events),
      getEntitlements: async (subject: string) => {
        entitlementSubject = subject
        return snapshot
      },
      reserve: async (candidate: Record<string, unknown>) => {
        reserveInput = candidate
        events.push("reserve")
        return reservation()
      },
      commit: async (candidate: Record<string, unknown>) => {
        commitInput = candidate
        events.push("commit")
        return terminal("committed")
      },
      rateLimit: async (candidate: DistributedAiRateLimitInput) => {
        input = candidate
        return rateLimitResult()
      },
    })

    const response = await handler(request("/api/ai/chat", { message: "Create a launch outline" }))

    assert.equal(response.status, 200)
    assert.deepEqual(input, { subject: customer.subject, operation: "ai-chat" })
    assert.equal(entitlementSubject, customer.subject)
    assert.equal(reserveInput?.subject, customer.subject)
    assert.equal(commitInput?.subject, customer.subject)
    assert.equal("email" in (reserveInput ?? {}), false)
    assert.equal("email" in (commitInput ?? {}), false)
    assert.deepEqual(events, ["reserve", "provider", "commit"])
  })

  await context.test("Grok chat", async () => {
    const events: string[] = []
    let input: DistributedAiRateLimitInput | undefined
    let entitlementSubject = ""
    let reserveInput: Record<string, unknown> | undefined
    let commitInput: Record<string, unknown> | undefined
    const handler = createGrokChatHandler({
      ...baseGrokDependencies(events),
      getEntitlements: async (subject: string) => {
        entitlementSubject = subject
        return snapshot
      },
      reserve: async (candidate: Record<string, unknown>) => {
        reserveInput = candidate
        events.push("reserve")
        return reservation()
      },
      commit: async (candidate: Record<string, unknown>) => {
        commitInput = candidate
        events.push("commit")
        return terminal("committed")
      },
      rateLimit: async (candidate: DistributedAiRateLimitInput) => {
        input = candidate
        return rateLimitResult()
      },
    })

    const response = await handler(
      request("/api/grok/chat", { agentId: "grok-content", message: "Draft content" }),
    )

    assert.equal(response.status, 200)
    assert.deepEqual(input, { subject: customer.subject, operation: "grok-chat" })
    assert.equal(entitlementSubject, customer.subject)
    assert.equal(reserveInput?.subject, customer.subject)
    assert.equal(commitInput?.subject, customer.subject)
    assert.equal("email" in (reserveInput ?? {}), false)
    assert.equal("email" in (commitInput ?? {}), false)
    assert.deepEqual(events, ["reserve", "provider", "commit"])
  })
})

test("customer chat routes fail closed when the distributed limiter is unavailable", async (context) => {
  const unavailable = async () =>
    rateLimitResult({
      allowed: false,
      available: false,
      code: "RATE_LIMIT_UNAVAILABLE",
      remaining: 0,
    })

  await context.test("AI chat", async () => {
    const events: string[] = []
    const handler = createAiChatHandler({ ...baseAiDependencies(events), rateLimit: unavailable })
    const response = await handler(request("/api/ai/chat", { message: "Create a launch outline" }))
    const body = await response.json()

    assert.equal(response.status, 503)
    assert.equal(body.code, "RATE_LIMIT_UNAVAILABLE")
    assert.deepEqual(events, [])
  })

  await context.test("Grok chat", async () => {
    const events: string[] = []
    const handler = createGrokChatHandler({ ...baseGrokDependencies(events), rateLimit: unavailable })
    const response = await handler(
      request("/api/grok/chat", { agentId: "grok-content", message: "Draft content" }),
    )
    const body = await response.json()

    assert.equal(response.status, 503)
    assert.equal(body.code, "RATE_LIMIT_UNAVAILABLE")
    assert.deepEqual(events, [])
  })
})

test("customer chat routes return 429 only for an available exhausted limiter", async (context) => {
  const exhausted = async () =>
    rateLimitResult({
      allowed: false,
      available: true,
      code: "AI_RATE_LIMITED",
      remaining: 0,
    })

  await context.test("AI chat", async () => {
    const events: string[] = []
    const handler = createAiChatHandler({ ...baseAiDependencies(events), rateLimit: exhausted })
    const response = await handler(request("/api/ai/chat", { message: "Create a launch outline" }))
    const body = await response.json()

    assert.equal(response.status, 429)
    assert.equal(body.code, "AI_RATE_LIMITED")
    assert.deepEqual(events, [])
  })

  await context.test("Grok chat", async () => {
    const events: string[] = []
    const handler = createGrokChatHandler({ ...baseGrokDependencies(events), rateLimit: exhausted })
    const response = await handler(
      request("/api/grok/chat", { agentId: "grok-content", message: "Draft content" }),
    )
    const body = await response.json()

    assert.equal(response.status, 429)
    assert.equal(body.code, "AI_RATE_LIMITED")
    assert.deepEqual(events, [])
  })
})

test("AI chat reserves before provider work and commits before returning output", async () => {
  const events: string[] = []
  let operationKey = ""
  const handler = createAiChatHandler({
    ...baseAiDependencies(events),
    reserve: async (input: { idempotencyKey: string }) => {
      operationKey = input.idempotencyKey
      events.push("reserve")
      return reservation()
    },
  })

  const response = await handler(request("/api/ai/chat", { message: "Create a launch outline" }))
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.response, "Validated provider response")
  assert.equal(operationKey, "ai-chat:operation-1234")
  assert.deepEqual(events, ["reserve", "provider", "commit"])
})

test("AI chat generates a bounded server operation key when the client omits one", async () => {
  const events: string[] = []
  let operationKey = ""
  const handler = createAiChatHandler({
    ...baseAiDependencies(events),
    generateOperationId: () => "server-operation-1234",
    reserve: async (input: { idempotencyKey: string }) => {
      operationKey = input.idempotencyKey
      events.push("reserve")
      return reservation()
    },
  })
  const withoutHeader = new NextRequest("http://127.0.0.1:3000/api/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Create a launch outline" }),
  })

  const response = await handler(withoutHeader)

  assert.equal(response.status, 200)
  assert.equal(operationKey, "ai-chat:server-operation-1234")
  assert.ok(operationKey.length <= 200)
  assert.deepEqual(events, ["reserve", "provider", "commit"])
})

test("AI chat refunds provider and output-validation failures", async (context) => {
  await context.test("provider failure", async () => {
    const events: string[] = []
    const handler = createAiChatHandler({
      ...baseAiDependencies(events),
      runProvider: async () => {
        events.push("provider")
        throw new Error("provider unavailable")
      },
    })

    const response = await handler(request("/api/ai/chat", { message: "Create a launch outline" }))
    const body = await response.json()
    assert.equal(response.status, 502)
    assert.equal(body.code, "AI_PROVIDER_FAILED")
    assert.equal(body.response, undefined)
    assert.deepEqual(events, ["reserve", "provider", "refund"])
  })

  await context.test("invalid provider output", async () => {
    const events: string[] = []
    const handler = createAiChatHandler({
      ...baseAiDependencies(events),
      runProvider: async () => {
        events.push("provider")
        return "   "
      },
    })

    const response = await handler(request("/api/ai/chat", { message: "Create a launch outline" }))
    const body = await response.json()
    assert.equal(response.status, 502)
    assert.equal(body.code, "AI_PROVIDER_INVALID_RESPONSE")
    assert.deepEqual(events, ["reserve", "provider", "refund"])
  })
})

test("AI and Grok refund a reservation when provider output is valid but commit fails", async (context) => {
  for (const route of ["AI", "Grok"] as const) {
    await context.test(route, async () => {
      const events: string[] = []
      let refundInput: Record<string, unknown> | undefined
      const overrides = {
        ...(route === "AI" ? baseAiDependencies(events) : baseGrokDependencies(events)),
        commit: async () => {
          events.push("commit")
          throw new Error("commit unavailable")
        },
        refund: async (candidate: Record<string, unknown>) => {
          refundInput = candidate
          events.push("refund")
          return terminal("refunded")
        },
        runProvider: async () => {
          events.push("provider")
          return "This output must not escape"
        },
      }
      const handler = route === "AI"
        ? createAiChatHandler(overrides)
        : createGrokChatHandler(overrides)
      const response = route === "AI"
        ? await handler(request("/api/ai/chat", { message: "Create a launch outline" }))
        : await handler(
            request("/api/grok/chat", {
              agentId: "grok-content",
              message: "Create a launch outline",
            }),
          )
      const body = await response.json()

      assert.equal(response.status, 503)
      assert.equal(body.code, "CREDIT_COMMIT_FAILED")
      assert.equal(body.response, undefined)
      assert.equal(JSON.stringify(body).includes("This output must not escape"), false)
      assert.equal(refundInput?.subject, customer.subject)
      assert.equal("email" in (refundInput ?? {}), false)
      assert.deepEqual(events, ["reserve", "provider", "commit", "refund"])
    })
  }
})

test("AI and Grok report reconciliation when commit and compensating refund both fail", async (context) => {
  for (const route of ["AI", "Grok"] as const) {
    await context.test(route, async () => {
      const events: string[] = []
      const overrides = {
        ...(route === "AI" ? baseAiDependencies(events) : baseGrokDependencies(events)),
        commit: async () => {
          events.push("commit")
          throw new Error("commit unavailable")
        },
        refund: async () => {
          events.push("refund")
          throw new Error("refund unavailable")
        },
        runProvider: async () => {
          events.push("provider")
          return "This output must not escape"
        },
      }
      const handler = route === "AI"
        ? createAiChatHandler(overrides)
        : createGrokChatHandler(overrides)
      const response = route === "AI"
        ? await handler(request("/api/ai/chat", { message: "Create a launch outline" }))
        : await handler(
            request("/api/grok/chat", {
              agentId: "grok-content",
              message: "Create a launch outline",
            }),
          )
      const body = await response.json()

      assert.equal(response.status, 503)
      assert.equal(body.code, "CREDIT_COMMIT_REFUND_FAILED")
      assert.equal(body.response, undefined)
      assert.equal(JSON.stringify(body).includes("This output must not escape"), false)
      assert.deepEqual(events, ["reserve", "provider", "commit", "refund"])
    })
  }
})

test("AI chat does not execute terminal or in-progress reservation replays", async (context) => {
  for (const replay of [
    { state: "committed" as const, idempotent: true, expected: "IDEMPOTENCY_KEY_REPLAYED" },
    { state: "refunded" as const, idempotent: true, expected: "IDEMPOTENCY_KEY_REPLAYED" },
    { state: "reserved" as const, idempotent: true, expected: "CREDIT_RESERVATION_IN_PROGRESS" },
  ]) {
    await context.test(replay.state, async () => {
      const events: string[] = []
      const handler = createAiChatHandler({
        ...baseAiDependencies(events),
        reserve: async () => {
          events.push("reserve")
          return reservation(replay.state, replay.idempotent)
        },
      })

      const response = await handler(request("/api/ai/chat", { message: "Create a launch outline" }))
      const body = await response.json()
      assert.equal(response.status, 409)
      assert.equal(body.code, replay.expected)
      assert.deepEqual(events, ["reserve"])
    })
  }
})

test("Grok chat executes only Content and uses reserve-provider-commit order", async () => {
  const events: string[] = []
  const handler = createGrokChatHandler(baseGrokDependencies(events))

  const unfinished = await handler(
    request("/api/grok/chat", { agentId: "grok-sales", message: "Help with sales" }),
  )
  const unfinishedBody = await unfinished.json()
  assert.equal(unfinished.status, 501)
  assert.equal(unfinishedBody.code, "NOT_IMPLEMENTED")
  assert.deepEqual(events, [])

  const content = await handler(
    request("/api/grok/chat", {
      agentId: "grok-content",
      message: "Draft a product announcement",
      conversationHistory: [{ role: "user", content: "Use a practical tone" }],
    }),
  )
  const contentBody = await content.json()
  assert.equal(content.status, 200)
  assert.equal(contentBody.agent, "content")
  assert.deepEqual(events, ["reserve", "provider", "commit"])
})

test("Grok chat rejects internal bearer execution and refunds provider failure", async () => {
  const internalEvents: string[] = []
  const internalHandler = createGrokChatHandler({
    ...baseGrokDependencies(internalEvents),
    authorize: async () => ({ kind: "internal" as const, subject: "internal-api" }),
  })
  const internal = await internalHandler(
    request("/api/grok/chat", { agentId: "grok-content", message: "Draft content" }),
  )
  assert.equal(internal.status, 401)
  assert.deepEqual(internalEvents, [])

  const failureEvents: string[] = []
  const failureHandler = createGrokChatHandler({
    ...baseGrokDependencies(failureEvents),
    runProvider: async () => {
      failureEvents.push("provider")
      throw new Error("provider unavailable")
    },
  })
  const failure = await failureHandler(
    request("/api/grok/chat", { agentId: "grok-content", message: "Draft content" }),
  )
  const failureBody = await failure.json()
  assert.equal(failure.status, 502)
  assert.equal(failureBody.code, "AI_PROVIDER_FAILED")
  assert.deepEqual(failureEvents, ["reserve", "provider", "refund"])
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
  const internalHandler = createGrokAgentsHandler({
    authorize: async () => ({ kind: "internal" as const, subject: "internal-api" }),
  })
  const internal = await internalHandler(request("/api/grok/agents"))
  assert.equal(internal.status, 401)

  let entitlementSubject = ""
  const customerHandler = createGrokAgentsHandler({
    authorize: async () => customer,
    getEntitlements: async (subject: string) => {
      entitlementSubject = subject
      return snapshot
    },
    hasAgentAccess: () => true,
    getAgents: () => grokAgentManager.getAllAgents(),
    getProviderModel: () => "test-model",
  })
  const response = await customerHandler(request("/api/grok/agents"))
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.agents.length, 1)
  assert.equal(body.agents[0].id, "grok-content")
  assert.equal(body.agents[0].entitled, true)
  assert.equal(entitlementSubject, customer.subject)
})
