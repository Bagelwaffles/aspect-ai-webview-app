import type { NextRequest } from "next/server"

import {
  isInternalApiAuthorized,
  unauthorizedInternalApiResponse,
} from "@/lib/server/internal-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function relevanceAgentsUnavailableResponse() {
  return Response.json(
    {
      ok: false,
      error: "Relevance agent management is unavailable during launch staging",
      code: "NOT_IMPLEMENTED",
    },
    {
      status: 501,
      headers: { "Cache-Control": "no-store" },
    },
  )
}

export async function GET(request: NextRequest) {
  if (!isInternalApiAuthorized(request)) {
    return unauthorizedInternalApiResponse()
  }

  return relevanceAgentsUnavailableResponse()
}

export async function POST(request: NextRequest) {
  if (!isInternalApiAuthorized(request)) {
    return unauthorizedInternalApiResponse()
  }

  return relevanceAgentsUnavailableResponse()
}
