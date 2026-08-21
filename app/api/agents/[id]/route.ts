import { NextRequest, NextResponse } from "next/server"

import {
  isInternalApiAuthorized,
  unauthorizedInternalApiResponse,
} from "@/lib/server/internal-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  if (!isInternalApiAuthorized(request)) {
    return unauthorizedInternalApiResponse()
  }

  const { id } = await context.params
  return NextResponse.json(
    {
      ok: false,
      error: "Agent not found",
      code: "AGENT_NOT_FOUND",
      id,
    },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  )
}

export async function PUT(request: NextRequest, _context: RouteContext) {
  if (!isInternalApiAuthorized(request)) {
    return unauthorizedInternalApiResponse()
  }

  return NextResponse.json(
    {
      ok: false,
      error: "Persistent agent storage is not configured",
      code: "AGENT_STORE_NOT_CONFIGURED",
    },
    { status: 501 },
  )
}

export async function DELETE(request: NextRequest, _context: RouteContext) {
  if (!isInternalApiAuthorized(request)) {
    return unauthorizedInternalApiResponse()
  }

  return NextResponse.json(
    {
      ok: false,
      error: "Persistent agent storage is not configured",
      code: "AGENT_STORE_NOT_CONFIGURED",
    },
    { status: 501 },
  )
}
