import { randomUUID } from "node:crypto"

import { xai } from "@ai-sdk/xai"
import { generateText } from "ai"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { grokAgentManager, type GrokAgentConfig } from "@/lib/grok-agents"
import { authorizePaidApiRequest } from "@/lib/server/customer-api-auth"
import { CreditLedgerError } from "@/lib/server/credit-ledger"
import {
  commitCreditReservation,
  getEntitlementSnapshot,
  refundCreditReservation,
  reserveCredits,
  snapshotHasAgentAccess,
} from "@/lib/server/entitlements"
import { consumeDistributedAiRateLimit } from "@/lib/server/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ConversationEntry = { role: "user" | "assistant"; content: string }

const conversationEntrySchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4000),
})

const requestSchema = z
  .object({
    agentId: z.string().trim().min(1).max(64),
    message: z.string().trim().min(1).max(4000),
    conversationHistory: z.array(conversationEntrySchema).max(20).optional(),
  })
  .superRefine((value, context) => {
    const historyLength = (value.conversationHistory ?? []).reduce(
      (total, entry) => total + entry.content.length,
      0,
    )
    if (historyLength > 16_000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Conversation history is too large",
        path: ["conversationHistory"],
      })
    }
  })

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/
const MAX_PROVIDER_OUTPUT_LENGTH = 20_000

type GrokChatDependencies = {
  authorize: typeof authorizePaidApiRequest
  getEntitlements: typeof getEntitlementSnapshot
  hasAgentAccess: typeof snapshotHasAgentAccess
  reserve: typeof reserveCredits
  commit: typeof commitCreditReservation
  refund: typeof refundCreditReservation
  rateLimit: typeof consumeDistributedAiRateLimit
  getAgent: (agentId: string) => GrokAgentConfig | undefined
  generateOperationId: () => string
  getProviderModel: () => string | null
  runProvider: (input: {
    model: string
    prompt: string
    temperature: number
    maxOutputTokens: number
  }) => Promise<string>
}

const defaultDependencies: GrokChatDependencies = {
  authorize: authorizePaidApiRequest,
  getEntitlements: getEntitlementSnapshot,
  hasAgentAccess: snapshotHasAgentAccess,
  reserve: reserveCredits,
  commit: commitCreditReservation,
  refund: refundCreditReservation,
  rateLimit: consumeDistributedAiRateLimit,
  getAgent: (agentId) => grokAgentManager.getAgent(agentId),
  generateOperationId: randomUUID,
  getProviderModel: () => {
    const apiKey = process.env.XAI_API_KEY?.trim()
    const model = process.env.XAI_MODEL?.trim()
    return apiKey && model ? model : null
  },
  runProvider: async ({ model, prompt, temperature, maxOutputTokens }) => {
    const result = await generateText({
      model: xai(model),
      prompt,
      temperature,
      maxOutputTokens,
    })
    return result.text
  },
}

type GrokChatTestGlobals = typeof globalThis & {
  __amsGrokChatTestDependencies?: Partial<GrokChatDependencies>
}

function testDependencies(): Partial<GrokChatDependencies> {
  if (process.env.NODE_ENV === "production") return {}
  return (globalThis as GrokChatTestGlobals).__amsGrokChatTestDependencies ?? {}
}

function noStoreJson(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

function resolveOperationKey(
  request: NextRequest,
  generateOperationId: () => string,
): { key: string } | { error: NextResponse } {
  const supplied = request.headers.get("idempotency-key")
  const value = supplied === null ? generateOperationId().trim() : supplied.trim()
  if (!IDEMPOTENCY_KEY_PATTERN.test(value)) {
    return {
      error: noStoreJson(
        {
          ok: false,
          error: "Idempotency-Key must contain 8 to 120 safe characters",
          code: "INVALID_IDEMPOTENCY_KEY",
        },
        400,
      ),
    }
  }
  return { key: `grok-chat:${value}` }
}

function reserveErrorResponse(error: unknown) {
  if (error instanceof CreditLedgerError && error.code === "CREDIT_LEDGER_IDEMPOTENCY_CONFLICT") {
    return noStoreJson(
      { ok: false, error: "Idempotency key conflicts with an earlier request", code: error.code },
      409,
    )
  }
  return noStoreJson(
    { ok: false, error: "Credit reservation service is unavailable", code: "CREDIT_RESERVATION_FAILED" },
    503,
  )
}

function createGrokChatHandler(overrides: Partial<GrokChatDependencies> = {}) {
  const dependencies = { ...defaultDependencies, ...overrides }

  return async function POST(request: NextRequest) {
    const principal = await dependencies.authorize(request)
    if (!principal || principal.kind !== "customer") {
      return noStoreJson(
        { ok: false, error: "A customer session is required", code: "CUSTOMER_SESSION_REQUIRED" },
        401,
      )
    }

    const parsed = requestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return noStoreJson(
        { ok: false, error: "Invalid agent message or conversation history", code: "INVALID_INPUT" },
        400,
      )
    }

    const agent = dependencies.getAgent(parsed.data.agentId)
    if (!agent) {
      return noStoreJson(
        { ok: false, error: "Unknown Grok agent", code: "AGENT_NOT_FOUND" },
        404,
      )
    }
    if (agent.id !== "grok-content") {
      return noStoreJson(
        {
          ok: false,
          error: "This Grok agent is not implemented for customer execution",
          code: "NOT_IMPLEMENTED",
        },
        501,
      )
    }

    const operationKey = resolveOperationKey(request, dependencies.generateOperationId)
    if ("error" in operationKey) return operationKey.error

    const rateLimit = await dependencies.rateLimit({
      subject: principal.subject,
      operation: "grok-chat",
    })
    if (!rateLimit.available) {
      return noStoreJson(
        {
          ok: false,
          error: "AI rate-limit service is unavailable",
          code: "RATE_LIMIT_UNAVAILABLE",
        },
        503,
      )
    }
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, error: "Rate limit exceeded", code: "AI_RATE_LIMITED" },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(rateLimit.retryAfterSeconds),
            "X-RateLimit-Limit": String(rateLimit.limit),
            "X-RateLimit-Remaining": "0",
          },
        },
      )
    }

    const model = dependencies.getProviderModel()
    if (!model) {
      return noStoreJson(
        { ok: false, error: "AI provider is not configured", code: "AI_PROVIDER_NOT_CONFIGURED" },
        503,
      )
    }

    const snapshot = await dependencies.getEntitlements(principal.subject).catch(() => null)
    if (!snapshot?.configured) {
      return noStoreJson(
        { ok: false, error: "Entitlement service is not configured", code: "ENTITLEMENTS_NOT_CONFIGURED" },
        503,
      )
    }
    if (!dependencies.hasAgentAccess(snapshot, "content")) {
      return noStoreJson(
        { ok: false, error: "Content Agent is not included in the account plan", code: "AGENT_ACCESS_REQUIRED" },
        402,
      )
    }

    let reservation: Awaited<ReturnType<typeof reserveCredits>>
    try {
      reservation = await dependencies.reserve({
        subject: principal.subject,
        units: 1,
        idempotencyKey: operationKey.key,
      })
    } catch (error) {
      return reserveErrorResponse(error)
    }

    if (reservation.state === "rejected") {
      return noStoreJson(
        { ok: false, error: "No AI credits remain", code: "CREDITS_REQUIRED" },
        402,
      )
    }
    if (reservation.idempotent || reservation.state !== "reserved") {
      const inProgress = reservation.state === "reserved"
      return noStoreJson(
        {
          ok: false,
          error: inProgress
            ? "A request with this idempotency key is already in progress"
            : "This idempotency key has already reached a terminal state",
          code: inProgress ? "CREDIT_RESERVATION_IN_PROGRESS" : "IDEMPOTENCY_KEY_REPLAYED",
        },
        409,
      )
    }

    const history = (parsed.data.conversationHistory ?? []) as ConversationEntry[]
    let prompt = `${agent.systemPrompt}\n\n`
    if (history.length > 0) {
      prompt += "Previous conversation:\n"
      history.slice(-6).forEach((entry) => {
        prompt += `${entry.role === "user" ? "User" : "Assistant"}: ${entry.content}\n`
      })
      prompt += "\n"
    }
    prompt += `Current user message: ${parsed.data.message}\n\nProvide a helpful response. Never invent live metrics, revenue, completed integrations, or customer results.`

    let text: string
    try {
      text = await dependencies.runProvider({
        model,
        prompt,
        temperature: agent.temperature,
        maxOutputTokens: agent.maxTokens,
      })
      if (!text.trim() || text.length > MAX_PROVIDER_OUTPUT_LENGTH) {
        throw new Error("INVALID_PROVIDER_OUTPUT")
      }
    } catch (error) {
      try {
        const refund = await dependencies.refund({
          subject: principal.subject,
          idempotencyKey: operationKey.key,
        })
        if (refund.state !== "refunded") throw new Error("CREDIT_REFUND_NOT_CONFIRMED")
      } catch {
        return noStoreJson(
          { ok: false, error: "AI request failed and its credit refund needs reconciliation", code: "CREDIT_REFUND_FAILED" },
          503,
        )
      }

      return noStoreJson(
        {
          ok: false,
          error: error instanceof Error && error.message === "INVALID_PROVIDER_OUTPUT"
            ? "AI provider returned an invalid response"
            : "AI provider request failed",
          code: error instanceof Error && error.message === "INVALID_PROVIDER_OUTPUT"
            ? "AI_PROVIDER_INVALID_RESPONSE"
            : "AI_PROVIDER_FAILED",
        },
        502,
      )
    }

    try {
      await dependencies.commit({
        subject: principal.subject,
        idempotencyKey: operationKey.key,
      })
    } catch {
      try {
        const refund = await dependencies.refund({
          subject: principal.subject,
          idempotencyKey: operationKey.key,
        })
        if (refund.state !== "refunded") throw new Error("CREDIT_REFUND_NOT_CONFIRMED")
      } catch {
        return noStoreJson(
          {
            ok: false,
            error: "AI response could not be committed or refunded",
            code: "CREDIT_COMMIT_REFUND_FAILED",
          },
          503,
        )
      }
      return noStoreJson(
        { ok: false, error: "AI response could not be safely committed", code: "CREDIT_COMMIT_FAILED" },
        503,
      )
    }

    return NextResponse.json(
      { ok: true, response: text, agent: "content" },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-RateLimit-Limit": String(rateLimit.limit),
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      },
    )
  }
}

export async function POST(request: NextRequest) {
  return createGrokChatHandler(testDependencies())(request)
}
