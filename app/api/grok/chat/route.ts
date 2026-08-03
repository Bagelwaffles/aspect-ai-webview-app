import { NextRequest, NextResponse } from "next/server"

import { grokAgentManager } from "@/lib/grok-agents"
import { authorizePaidApiRequest } from "@/lib/server/customer-api-auth"
import { consumeAiRateLimit } from "@/lib/server/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const principal = await authorizePaidApiRequest(request)
  if (!principal) {
    return NextResponse.json(
      { ok: false, error: "Authentication required", code: "CUSTOMER_AUTH_REQUIRED" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    )
  }

  const body = await request.json().catch(() => null)
  const agentId = body && typeof body === "object" ? body.agentId : undefined
  const message = body && typeof body === "object" ? body.message : undefined
  const conversationHistory = body && typeof body === "object" ? body.conversationHistory : undefined

  if (typeof agentId !== "string" || !grokAgentManager.getAgent(agentId)) {
    return NextResponse.json({ ok: false, error: "Unknown agent" }, { status: 400 })
  }

  if (typeof message !== "string" || !message.trim() || message.length > 4000) {
    return NextResponse.json(
      { ok: false, error: "A message between 1 and 4,000 characters is required" },
      { status: 400 },
    )
  }

  if (
    conversationHistory !== undefined &&
    (!Array.isArray(conversationHistory) ||
      conversationHistory.length > 20 ||
      conversationHistory.some(
        (entry) =>
          !entry ||
          typeof entry !== "object" ||
          !["user", "assistant"].includes(entry.role) ||
          typeof entry.content !== "string" ||
          entry.content.length > 4000,
      ))
  ) {
    return NextResponse.json({ ok: false, error: "Invalid conversation history" }, { status: 400 })
  }

  const rateLimit = consumeAiRateLimit(`${principal.subject}:grok-chat`)
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

  if (!process.env.XAI_API_KEY?.trim() || !process.env.XAI_MODEL?.trim()) {
    return NextResponse.json(
      { ok: false, error: "AI provider is not configured", code: "AI_PROVIDER_NOT_CONFIGURED" },
      { status: 503 },
    )
  }

  try {
    const response = await grokAgentManager.generateResponse(agentId, message.trim(), conversationHistory)
    return NextResponse.json(
      { ok: true, response },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-RateLimit-Limit": String(rateLimit.limit),
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      },
    )
  } catch {
    return NextResponse.json({ ok: false, error: "AI provider request failed" }, { status: 502 })
  }
}
