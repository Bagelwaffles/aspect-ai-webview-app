import { grokAgentManager } from "@/lib/grok-agents"
import type { NextRequest } from "next/server"

export const runtime = "nodejs"

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { message, conversationHistory } = await req.json()

    if (!message) {
      return Response.json({ error: "Message is required" }, { status: 400 })
    }

    // Extract agent ID from deployment ID (simplified mapping)
    const agentId = "grok-support" // This would be mapped from deployment config

    const response = await grokAgentManager.generateResponse(agentId, message, conversationHistory)

    return Response.json({ response })
  } catch (error) {
    console.error("Webhook error:", error)
    return Response.json({ error: "Failed to process message" }, { status: 500 })
  }
}
