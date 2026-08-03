import { NextRequest, NextResponse } from "next/server"

import { grokAgentManager } from "@/lib/grok-agents"
import { authorizePaidApiRequest } from "@/lib/server/customer-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const principal = await authorizePaidApiRequest(request)
  if (!principal) {
    return NextResponse.json(
      { ok: false, error: "Authentication required", code: "CUSTOMER_AUTH_REQUIRED" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    )
  }

  const agents = grokAgentManager.getAllAgents().map((agent) => ({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    model: process.env.XAI_MODEL?.trim() ?? "not_configured",
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
    capabilities: agent.capabilities,
    status: agent.status,
    personality: agent.personality,
  }))

  return NextResponse.json(
    { ok: true, agents },
    { headers: { "Cache-Control": "no-store" } },
  )
}
