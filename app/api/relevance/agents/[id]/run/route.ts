import type { NextRequest } from "next/server"

import { relevanceClient } from "@/lib/relevance"
import {
  isInternalApiAuthorized,
  unauthorizedInternalApiResponse,
} from "@/lib/server/internal-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isInternalApiAuthorized(request)) {
    return unauthorizedInternalApiResponse()
  }

  try {
    const body = await request.json()
    const input = body && typeof body === "object" ? body.input : undefined

    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return Response.json({ error: "A structured input object is required" }, { status: 400 })
    }

    const result = await relevanceClient.runAgent(params.id, input)
    return Response.json({ result }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return Response.json({ error: "Failed to run Relevance agent" }, { status: 502 })
  }
}
