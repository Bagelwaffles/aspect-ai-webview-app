import { NextRequest, NextResponse } from "next/server"

import { constantTimeStringEqual } from "@/lib/server/internal-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.N8N_WEBHOOK_SECRET?.trim()
  const supplied = request.headers.get("x-vo-secret")?.trim()
  return Boolean(expected && supplied && constantTimeStringEqual(supplied, expected))
}

function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isValidAmount(value: unknown, max = 100000): value is number {
  return Number.isInteger(value) && Number(value) > 0 && Number(value) <= max
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 })
  }

  const action = typeof payload.action === "string" ? payload.action.trim() : ""
  if (!action) {
    return NextResponse.json({ ok: false, error: "Missing action field" }, { status: 400 })
  }

  if (action === "status.ping") {
    return NextResponse.json({ ok: true, action, timestamp: new Date().toISOString() })
  }

  if (action === "relevance.ask.app") {
    if (!isValidEmail(payload.email) || typeof payload.message !== "string" || !payload.message.trim()) {
      return NextResponse.json({ ok: false, error: "Invalid relevance request" }, { status: 400 })
    }

    return NextResponse.json(
      { ok: false, error: "NOT_IMPLEMENTED", action },
      { status: 501 },
    )
  }

  if (action === "credits.use" || action === "credits.add") {
    if (!isValidEmail(payload.email) || !isValidAmount(payload.amount)) {
      return NextResponse.json({ ok: false, error: "Invalid credit request" }, { status: 400 })
    }

    return NextResponse.json(
      { ok: false, error: "NOT_IMPLEMENTED", action },
      { status: 501 },
    )
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 })
}

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      status: "listening",
      endpoint: "/api/webhooks/n8n",
      configured: Boolean(process.env.N8N_WEBHOOK_SECRET?.trim()),
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
