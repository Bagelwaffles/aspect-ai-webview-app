import { NextRequest, NextResponse } from "next/server"

import { grokAgentManager } from "@/lib/grok-agents"
import {
  isInternalApiAuthorized,
  unauthorizedInternalApiResponse,
} from "@/lib/server/internal-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  if (!isInternalApiAuthorized(request)) {
    return unauthorizedInternalApiResponse()
  }

  const { id } = await context.params
  const agent = grokAgentManager.getAgent(id)
  if (!agent) {
    return NextResponse.json({ ok: false, error: "Agent not found" }, { status: 404 })
  }

  const body = await request.json().catch(() => null)
  const message = body && typeof body === "object" ? body.message : undefined
  const conversationHistory = body && typeof body === "object" ? body.conversationHistory : undefined

  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ ok: false, error: "Message is required" }, { status: 400 })
  }

  if (
    conversationHistory !== undefined &&
    (!Array.isArray(conversationHistory) ||
      conversationHistory.some(
        (entry) =>
          !entry ||
          typeof entry !== "object" ||
          !["user", "assistant"].includes(entry.role) ||
          typeof entry.content !== "string",
      ))
  ) {
    return NextResponse.json({ ok: false, error: "Invalid conversation history" }, { status: 400 })
  }

  try {
    const response = await grokAgentManager.generateResponse(id, message.trim(), conversationHistory)
    return NextResponse.json({ ok: true, response })
  } catch {
    return NextResponse.json({ ok: false, error: "Agent execution failed" }, { status: 502 })
  }
}
