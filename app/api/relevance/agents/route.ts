import { relevanceClient } from "@/lib/relevance"
import type { NextRequest } from "next/server"

export const runtime = "nodejs"

export async function GET() {
  try {
    const agents = await relevanceClient.getAgents()
    return Response.json({ agents })
  } catch (error) {
    console.error("Relevance agents API error:", error)
    return Response.json({ error: "Failed to fetch Relevance agents" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const agentData = await req.json()
    const agent = await relevanceClient.createAgent(agentData)
    return Response.json({ agent }, { status: 201 })
  } catch (error) {
    console.error("Failed to create Relevance agent:", error)
    return Response.json({ error: "Failed to create agent" }, { status: 500 })
  }
}
