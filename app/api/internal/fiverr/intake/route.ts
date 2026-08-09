import { timingSafeEqual } from "node:crypto"

import { NextRequest, NextResponse } from "next/server"

import {
  buildFiverrOperatorBrief,
  normalizeFiverrNotification,
} from "@/lib/server/fiverr-bridge"
import { recordFiverrOperation } from "@/lib/server/fiverr-operations"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = 128 * 1024

function noStoreJson(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

function configuredKey() {
  return process.env.AMS_N8N_INTERNAL_KEY?.trim() ?? ""
}

function safeEqual(left: string, right: string) {
  const leftBytes = Uint8Array.from(Buffer.from(left, "utf8"))
  const rightBytes = Uint8Array.from(Buffer.from(right, "utf8"))
  if (leftBytes.length !== rightBytes.length) return false
  return timingSafeEqual(leftBytes, rightBytes)
}

function authorize(request: NextRequest) {
  const expected = configuredKey()
  if (!expected) return false
  const presented = request.headers.get("x-ams-internal-key")?.trim() ?? ""
  return Boolean(presented) && safeEqual(presented, expected)
}

async function boundedJson(request: NextRequest) {
  const contentLength = Number.parseInt(request.headers.get("content-length") ?? "", 10)
  if (Number.isSafeInteger(contentLength) && contentLength > MAX_BODY_BYTES) {
    return { ok: false as const, status: 413, code: "FIVERR_PAYLOAD_TOO_LARGE" }
  }

  const raw = await request.text().catch(() => null)
  if (raw === null || Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return { ok: false as const, status: 413, code: "FIVERR_PAYLOAD_TOO_LARGE" }
  }

  try {
    return { ok: true as const, value: JSON.parse(raw) as unknown }
  } catch {
    return { ok: false as const, status: 400, code: "FIVERR_PAYLOAD_INVALID_JSON" }
  }
}

export async function GET() {
  return noStoreJson(
    {
      ok: true,
      status: "listening",
      endpoint: "/api/internal/fiverr/intake",
      configured: Boolean(configuredKey()),
      source: "fiverr_email",
      human_approval_required: true,
      auto_delivery_enabled: false,
      operations_persistence: "enabled_when_redis_available",
    },
    200,
  )
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) {
    return noStoreJson(
      { ok: false, error: { code: "FIVERR_INTERNAL_AUTH_REQUIRED", message: "Authentication is required" } },
      401,
    )
  }

  const body = await boundedJson(request)
  if (!body.ok) {
    return noStoreJson(
      { ok: false, error: { code: body.code, message: "Fiverr intake request was rejected" } },
      body.status,
    )
  }

  try {
    const event = normalizeFiverrNotification(body.value)
    const operatorBrief = buildFiverrOperatorBrief(event)
    const persistence = await recordFiverrOperation(event)

    return noStoreJson(
      {
        ok: true,
        status: "accepted",
        event,
        operator_brief: operatorBrief,
        operations_persistence: persistence,
      },
      200,
    )
  } catch (error) {
    const code = error instanceof Error ? error.message : "FIVERR_INTAKE_REJECTED"
    const senderRejected = code === "FIVERR_SENDER_NOT_ALLOWED"
    return noStoreJson(
      {
        ok: false,
        error: {
          code: senderRejected ? code : "FIVERR_INTAKE_SCHEMA_INVALID",
          message: senderRejected
            ? "Sender is not an allowed Fiverr notification domain"
            : "Fiverr intake request failed validation",
        },
      },
      senderRejected ? 403 : 400,
    )
  }
}
