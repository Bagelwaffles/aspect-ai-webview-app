import type { NextRequest } from "next/server"

import {
  isInternalApiAuthorized,
  unauthorizedInternalApiResponse,
} from "@/lib/server/internal-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  return Response.json(
    {
      deployments: [],
      source: "persistent_deployment_store",
      status: "not_configured",
      message: "No live deployments are connected yet.",
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function POST(request: NextRequest) {
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
