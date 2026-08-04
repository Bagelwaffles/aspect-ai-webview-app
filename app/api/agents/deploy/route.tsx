import type { NextRequest } from "next/server"

import {
  isInternalApiAuthorized,
  unauthorizedInternalApiResponse,
} from "@/lib/server/internal-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  if (!isInternalApiAuthorized(request)) {
    return unauthorizedInternalApiResponse()
  }

  return Response.json(
    {
      ok: false,
      error: "Agent deployment is not implemented",
      code: "NOT_IMPLEMENTED",
    },
    {
      status: 501,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  )
}
