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
    {
      agents: [],
      source: "persistent_agent_store",
      status: "not_configured",
      message: "No live agent records are connected yet.",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  )
}

export async function POST(request: NextRequest) {
  if (!isInternalApiAuthorized(request)) {
    return unauthorizedInternalApiResponse()
  }

  return Response.json(
    {
      ok: false,
      error: "Agent persistence is not configured",
      code: "AGENT_STORE_NOT_CONFIGURED",
    },
    { status: 501 },
  )
}
