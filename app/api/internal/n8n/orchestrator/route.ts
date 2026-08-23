import { createHash, randomUUID } from "node:crypto"

import { NextRequest, NextResponse } from "next/server"

import {
  AmsN8nWebhookClientError,
  RedisAmsN8nIdempotencyStore,
  amsN8nGatewayRequestSchema,
  redactAmsN8nLogData,
  sendAmsN8nWebhook,
  type AmsN8nIdempotencyStore,
  type AmsN8nWebhookResponse,
} from "@/lib/server/ams-n8n-webhook-client"
import { authorizeCustomerApiRequest } from "@/lib/server/customer-api-auth"
import { consumeDistributedAiRateLimit } from "@/lib/server/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = 64 * 1024
const IDEMPOTENCY_TTL_SECONDS = 60 * 60

type AmsN8nGatewayDependencies = {
  authorize: typeof authorizeCustomerApiRequest
  rateLimit: typeof consumeDistributedAiRateLimit
  sendWebhook: typeof sendAmsN8nWebhook
  getIdempotencyStore: () => AmsN8nIdempotencyStore
  idFactory: () => string
}

const defaultDependencies: AmsN8nGatewayDependencies = {
  authorize: authorizeCustomerApiRequest,
  rateLimit: consumeDistributedAiRateLimit,
  sendWebhook: sendAmsN8nWebhook,
  getIdempotencyStore: () => new RedisAmsN8nIdempotencyStore(),
  idFactory: randomUUID,
}

type AmsN8nGatewayTestGlobals = typeof globalThis & {
  __amsN8nGatewayTestDependencies?: Partial<AmsN8nGatewayDependencies>
}

function dependenciesForRequest(): AmsN8nGatewayDependencies {
  const overrides =
    process.env.NODE_ENV === "production"
      ? {}
      : (globalThis as AmsN8nGatewayTestGlobals).__amsN8nGatewayTestDependencies ?? {}
  return { ...defaultDependencies, ...overrides }
}

export function isN8nExecutionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== "production") return true
  return env.AMS_N8N_ENABLED?.trim().toLowerCase() === "true"
}

function noStoreJson(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

function structuredError(status: number, code: string, message: string) {
  return noStoreJson({ ok: false, error: { code, message } }, status)
}

function requestHash(subject: string, rawBody: string) {
  return createHash("sha256").update(`${subject}\0${rawBody}`).digest("hex")
}

function parseContentLength(value: string | null): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

async function readBoundedBody(request: NextRequest): Promise<string | NextResponse> {
  const contentLength = parseContentLength(request.headers.get("content-length"))
  if (contentLength !== null && contentLength > MAX_BODY_BYTES) {
    return structuredError(413, "N8N_PAYLOAD_TOO_LARGE", "Request payload is too large")
  }

  const rawBody = await request.text().catch(() => null)
  if (rawBody === null) {
    return structuredError(400, "N8N_REQUEST_MALFORMED", "Expected a valid JSON request body")
  }

  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return structuredError(413, "N8N_PAYLOAD_TOO_LARGE", "Request payload is too large")
  }

  return rawBody
}

function safeGatewayResult(result: AmsN8nWebhookResponse) {
  return {
    ok: result.ok,
    request_id: result.request_id,
    action: result.action,
    status: result.status,
    ...(result.result === undefined ? {} : { result: result.result }),
    ...(result.error === undefined ? {} : { error: result.error }),
  }
}

export async function POST(request: NextRequest) {
  if (!isN8nExecutionEnabled()) {
    return structuredError(
      410,
      "N8N_EXECUTION_RETIRED",
      "n8n execution is retired from AMS core production",
    )
  }

  const dependencies = dependenciesForRequest()
  const principal = await dependencies.authorize(request)

  if (!principal) {
    return structuredError(401, "AMS_AUTH_REQUIRED", "Authentication is required")
  }

  const rawBody = await readBoundedBody(request)
  if (typeof rawBody !== "string") return rawBody

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return structuredError(400, "N8N_REQUEST_MALFORMED", "Expected a valid JSON object")
  }

  const parsed = amsN8nGatewayRequestSchema.safeParse(body)
  if (!parsed.success) {
    const flattened = parsed.error.flatten()
    const code = "N8N_REQUEST_SCHEMA_INVALID"
    console.warn(
      "AMS n8n request schema rejected",
      redactAmsN8nLogData({ code, action: (body as { action?: unknown })?.action, flattened }),
    )
    return structuredError(400, code, "AMS n8n request failed schema validation")
  }

  const rateLimit = await dependencies.rateLimit({
    subject: principal.subject,
    operation: "n8n-orchestrator",
    limit: 20,
    windowMs: 60_000,
  })

  if (!rateLimit.allowed) {
    return structuredError(
      rateLimit.available ? 429 : 503,
      rateLimit.code,
      rateLimit.available ? "Too many AMS n8n requests" : "AMS n8n rate limit is unavailable",
    )
  }

  const requestId = dependencies.idFactory()
  const hash = requestHash(principal.subject, rawBody)
  const idempotencyKey = `ams-n8n-${hash.slice(0, 48)}`
  const store = dependencies.getIdempotencyStore()

  try {
    const reservation = await store.reserve({
      key: idempotencyKey,
      requestHash: hash,
      ttlSeconds: IDEMPOTENCY_TTL_SECONDS,
      requestId,
    })

    if (reservation.status === "conflict") {
      return structuredError(
        409,
        "N8N_IDEMPOTENCY_CONFLICT",
        "The idempotency key is already bound to a different request",
      )
    }

    if (reservation.status === "duplicate") {
      return noStoreJson(
        reservation.response
          ? { ...safeGatewayResult(reservation.response), idempotent: true }
          : {
              ok: true,
              request_id: requestId,
              action: parsed.data.action,
              status: "duplicate",
              idempotent: true,
            },
        reservation.response?.ok === false ? 502 : 200,
      )
    }

    const result = await dependencies.sendWebhook({
      action: parsed.data.action,
      payload: parsed.data.payload,
      meta: parsed.data.meta,
      requestId,
      idempotencyKey,
    })

    await store.complete({
      key: idempotencyKey,
      response: result,
      ttlSeconds: IDEMPOTENCY_TTL_SECONDS,
    })

    return noStoreJson(safeGatewayResult(result), result.ok ? 200 : 502)
  } catch (error) {
    const safeError =
      error instanceof AmsN8nWebhookClientError
        ? { code: error.code, message: error.message, status: error.status }
        : {
            code: "N8N_ORCHESTRATOR_FAILED",
            message: "n8n orchestrator request failed",
            status: 502,
          }

    console.error(
      "AMS n8n gateway request failed",
      redactAmsN8nLogData({
        action: parsed.data.action,
        requestId,
        idempotencyKey,
        error: safeError,
      }),
    )

    return structuredError(safeError.status, safeError.code, safeError.message)
  }
}
