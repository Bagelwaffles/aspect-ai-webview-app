import type { NextRequest } from "next/server"

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

  return Response.json(
    { error: "Deployment not found", code: "DEPLOYMENT_NOT_FOUND" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  )
}

export async function PUT(request: NextRequest) {
  if (!isInternalApiAuthorized(request)) {
    return unauthorizedInternalApiResponse()
  }

  return Response.json(
    {
      ok: false,
      error: "Persistent deployment storage is not configured",
      code: "DEPLOYMENT_STORE_NOT_CONFIGURED",
    },
    { status: 501 },
  )
}

export async function DELETE(request: NextRequest) {
  if (!isInternalApiAuthorized(request)) {
    return unauthorizedInternalApiResponse()
  }

  return Response.json(
    {
      ok: false,
      error: "Persistent deployment storage is not configured",
      code: "DEPLOYMENT_STORE_NOT_CONFIGURED",
    },
    { status: 501 },
  )
}
