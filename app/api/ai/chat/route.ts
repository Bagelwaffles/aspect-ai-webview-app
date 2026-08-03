import { xai } from "@ai-sdk/xai"
import { generateText } from "ai"
import { NextRequest, NextResponse } from "next/server"

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
