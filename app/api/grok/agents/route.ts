import { grokAgentManager } from "@/lib/grok-agents"

export const runtime = "nodejs"

export async function GET() {
  try {
    const agents = grokAgentManager.getAllAgents()
    return Response.json({ agents })
  } catch (error) {
    console.error("Failed to fetch Grok agents:", error)
    return Response.json({ error: "Failed to fetch agents" }, { status: 500 })
  }
}
