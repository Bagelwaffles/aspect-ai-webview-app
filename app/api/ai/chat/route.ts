import { randomUUID } from "node:crypto"

import { xai } from "@ai-sdk/xai"
import { generateText } from "ai"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

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

const requestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
})

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/
const MAX_PROVIDER_OUTPUT_LENGTH = 20_000

type AiChatDependencies = {
  authorize: typeof authorizePaidApiRequest
  getEntitlements: typeof getEntitlementSnapshot
  hasAgentAccess: typeof snapshotHasAgentAccess
  reserve: typeof reserveCredits
  commit: typeof commitCreditReservation
  refund: typeof refundCreditReservation
  rateLimit: typeof consumeDistributedAiRateLimit
  generateOperationId: () => string
  getProviderModel: () => string | null
  runProvider: (input: { model: string; prompt: string }) => Promise<string>
}

const defaultDependencies: AiChatDependencies = {
  authorize: authorizePaidApiRequest,
  getEntitlements: getEntitlementSnapshot,
  hasAgentAccess: snapshotHasAgentAccess,
  reserve: reserveCredits,
  commit: commitCreditReservation,
  refund: refundCreditReservation,
  rateLimit: consumeDistributedAiRateLimit,
  generateOperationId: randomUUID,
  getProviderModel: () => {
    const apiKey = process.env.XAI_API_KEY?.trim()
    const model = process.env.XAI_MODEL?.trim()
    return apiKey && model ? model : null
  },
  runProvider: async ({ model, prompt }) => {
    const result = await generateText({
      model: xai(model),
      prompt,
      maxOutputTokens: 700,
    })
    return result.text
  },
}

type AiChatTestGlobals = typeof globalThis & {
  __amsAiChatTestDependencies?: Partial<AiChatDependencies>
}

function testDependencies(): Partial<AiChatDependencies> {
  if (process.env.NODE_ENV === "production") return {}
  return (globalThis as AiChatTestGlobals).__amsAiChatTestDependencies ?? {}
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
  return { key: `ai-chat:${value}` }
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

function createAiChatHandler(overrides: Partial<AiChatDependencies> = {}) {
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
        { ok: false, error: "A message between 1 and 4,000 characters is required", code: "INVALID_INPUT" },
        400,
      )
    }

    const operationKey = resolveOperationKey(request, dependencies.generateOperationId)
    if ("error" in operationKey) return operationKey.error

    const rateLimit = await dependencies.rateLimit({
      subject: principal.subject,
      operation: "ai-chat",
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
        { ok: false, error: "An active AMS plan is required", code: "SUBSCRIPTION_REQUIRED" },
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

    let text: string
    try {
      text = await dependencies.runProvider({
        model,
        prompt: `You are an AI assistant for Aspect Marketing Solutions. Provide concise, practical marketing and automation guidance. Never invent live metrics, revenue, customer results, or completed integrations. Clearly label assumptions.\n\nUser message: ${parsed.data.message}`,
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
      { ok: true, response: text },
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
  return createAiChatHandler(testDependencies())(request)
}
