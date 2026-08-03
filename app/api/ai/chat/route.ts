import { xai } from "@ai-sdk/xai"
import { generateText } from "ai"
import { NextRequest, NextResponse } from "next/server"

import { authorizePaidApiRequest } from "@/lib/server/customer-api-auth"
import {
  consumeCredits,
  getEntitlementSnapshot,
  snapshotHasAgentAccess,
} from "@/lib/server/entitlements"
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

  if (principal.kind === "customer") {
    const snapshot = await getEntitlementSnapshot(principal.email).catch(() => null)
    if (!snapshot?.configured) {
      return NextResponse.json(
        { ok: false, error: "Entitlement service is not configured", code: "ENTITLEMENTS_NOT_CONFIGURED" },
        { status: 503 },
      )
    }
    if (!snapshotHasAgentAccess(snapshot, "content")) {
      return NextResponse.json(
        { ok: false, error: "An active AMS plan is required", code: "SUBSCRIPTION_REQUIRED" },
        { status: 402 },
      )
    }
    if (snapshot.totalCredits < 1) {
      return NextResponse.json(
        { ok: false, error: "No AI credits remain", code: "CREDITS_REQUIRED" },
        { status: 402 },
      )
    }
  }

  const rateLimit = consumeAiRateLimit(`${principal.subject}:ai-chat`)
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

  const body = await request.json().catch(() => null)
  const message = body && typeof body === "object" ? body.message : undefined

  if (typeof message !== "string" || !message.trim() || message.length > 4000) {
    return NextResponse.json(
      { ok: false, error: "A message between 1 and 4,000 characters is required" },
      { status: 400 },
    )
  }

  const apiKey = process.env.XAI_API_KEY?.trim()
  const model = process.env.XAI_MODEL?.trim()
  if (!apiKey || !model) {
    return NextResponse.json(
      { ok: false, error: "AI provider is not configured", code: "AI_PROVIDER_NOT_CONFIGURED" },
      { status: 503 },
    )
  }

  try {
    const { text } = await generateText({
      model: xai(model),
      prompt: `You are an AI assistant for Aspect Marketing Solutions. Provide concise, practical marketing and automation guidance. Never invent live metrics, revenue, customer results, or completed integrations. Clearly label assumptions.\n\nUser message: ${message.trim()}`,
      maxOutputTokens: 700,
    })

    if (principal.kind === "customer") {
      const creditResult = await consumeCredits(principal.email, 1)
      if (!creditResult.consumed) {
        return NextResponse.json(
          { ok: false, error: "No AI credits remain", code: "CREDITS_REQUIRED" },
          { status: 402 },
        )
      }
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
  } catch {
    return NextResponse.json({ ok: false, error: "AI provider request failed" }, { status: 502 })
  }
}
