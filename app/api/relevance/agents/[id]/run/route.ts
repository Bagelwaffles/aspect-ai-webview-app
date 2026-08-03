import { NextRequest, NextResponse } from "next/server"

import { relevanceClient } from "@/lib/relevance"
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
  const body = await request.json().catch(() => null)
  const input = body && typeof body === "object" ? body.input : undefined

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return NextResponse.json({ error: "A structured input object is required" }, { status: 400 })
  }

  try {
    const result = await relevanceClient.runAgent(id, input)
    return NextResponse.json({ result }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ error: "Failed to run Relevance agent" }, { status: 502 })
  }
}
