import type { NextRequest } from "next/server"

import { relevanceClient } from "@/lib/relevance"
import {
  isInternalApiAuthorized,
  unauthorizedInternalApiResponse,
} from "@/lib/server/internal-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  if (!isInternalApiAuthorized(request)) {
    return unauthorizedInternalApiResponse()
  }

  try {
    const agents = await relevanceClient.getAgents()
    return Response.json({ agents }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return Response.json({ error: "Failed to fetch Relevance agents" }, { status: 502 })
  }
}

export async function POST(request: NextRequest) {
  if (!isInternalApiAuthorized(request)) {
    return unauthorizedInternalApiResponse()
  }

  try {
    const agentData = await request.json()
    const agent = await relevanceClient.createAgent(agentData)
    return Response.json({ agent }, { status: 201 })
  } catch {
    return Response.json({ error: "Failed to create Relevance agent" }, { status: 502 })
  }
}
