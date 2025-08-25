import { grokAgentManager } from "@/lib/grok-agents"
import type { NextRequest } from "next/server"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const { agentId, message, conversationHistory } = await req.json()

    if (!agentId || !message) {
      return new Response("Agent ID and message are required", { status: 400 })
    }

    const result = await grokAgentManager.streamResponse(agentId, message, conversationHistory)

    return result.toTextStreamResponse()
  } catch (error) {
    console.error("Grok stream error:", error)
    return new Response("Failed to generate response", { status: 500 })
  }
}
