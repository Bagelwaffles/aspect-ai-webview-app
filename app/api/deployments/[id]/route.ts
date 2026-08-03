import type { NextRequest } from "next/server"

import {
  isInternalApiAuthorized,
  unauthorizedInternalApiResponse,
} from "@/lib/server/internal-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  return Response.json({ error: "Deployment not found" }, { status: 404 })
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
