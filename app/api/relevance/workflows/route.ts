import type { NextRequest } from "next/server"

import {
  isInternalApiAuthorized,
  unauthorizedInternalApiResponse,
} from "@/lib/server/internal-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function relevanceWorkflowsUnavailableResponse() {
  return Response.json(
    {
      ok: false,
      error: "Relevance workflow management is unavailable during launch staging",
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

  return relevanceWorkflowsUnavailableResponse()
}

export async function POST(request: NextRequest) {
  if (!isInternalApiAuthorized(request)) {
    return unauthorizedInternalApiResponse()
  }

  return relevanceWorkflowsUnavailableResponse()
}
