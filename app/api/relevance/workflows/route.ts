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
    const workflows = await relevanceClient.getWorkflows()
    return Response.json({ workflows }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return Response.json({ error: "Failed to fetch Relevance workflows" }, { status: 502 })
  }
}

export async function POST(request: NextRequest) {
  if (!isInternalApiAuthorized(request)) {
    return unauthorizedInternalApiResponse()
  }

  try {
    const workflowData = await request.json()
    const workflow = await relevanceClient.createWorkflow(workflowData)
    return Response.json({ workflow }, { status: 201 })
  } catch {
    return Response.json({ error: "Failed to create Relevance workflow" }, { status: 502 })
  }
}
