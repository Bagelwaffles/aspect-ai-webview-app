import { NextRequest, NextResponse } from "next/server"

import {
  AmsN8nWebhookClientError,
  redactAmsN8nLogData,
  sendAmsN8nWebhook,
  type JsonValue,
} from "@/lib/server/ams-n8n-webhook-client"
import { isInternalApiAuthorized, unauthorizedInternalApiResponse } from "@/lib/server/internal-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function structuredError(status: number, code: string, message: string) {
  return NextResponse.json(
    {
      ok: false,
      error: { code, message },
    },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  )
}

export async function POST(request: NextRequest) {
  if (!isInternalApiAuthorized(request)) return unauthorizedInternalApiResponse()

  const body = await request.json().catch(() => null)
  if (!isRecord(body)) {
    return structuredError(400, "N8N_REQUEST_MALFORMED", "Expected a JSON object")
  }

  const action = typeof body.action === "string" ? body.action.trim() : ""
  if (!action) {
    return structuredError(400, "N8N_ACTION_MISSING", "Expected a non-empty action")
  }

  try {
    const result = await sendAmsN8nWebhook({
      action,
      payload: isRecord(body.payload) ? body.payload : {},
      meta: isRecord(body.meta) ? body.meta : {},
      requestId: typeof body.request_id === "string" ? body.request_id : undefined,
      idempotencyKey: request.headers.get("idempotency-key")?.trim() || undefined,
    })

    return NextResponse.json(result, {
      status: result.ok ? 200 : 502,
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    const safeError =
      error instanceof AmsN8nWebhookClientError
        ? { code: error.code, message: error.message, status: error.status }
        : { code: "N8N_ORCHESTRATOR_FAILED", message: "n8n orchestrator request failed", status: 500 }

    console.error(
      "AMS n8n orchestrator request failed",
      redactAmsN8nLogData({
        action,
        error: safeError,
      }),
    )

    return structuredError(safeError.status, safeError.code, safeError.message)
  }
}
