import { grokAgentManager } from "@/lib/grok-agents"
import type { NextRequest } from "next/server"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const { agentId, message, conversationHistory } = await req.json()

    if (!agentId || !message) {
      return Response.json({ error: "Agent ID and message are required" }, { status: 400 })
    }

    const response = await grokAgentManager.generateResponse(agentId, message, conversationHistory)

    return Response.json({ response })
  } catch (error) {
    console.error("Grok chat error:", error)
    return Response.json({ error: "Failed to generate response" }, { status: 500 })
  }
}
