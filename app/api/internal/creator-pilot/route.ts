import { NextRequest, NextResponse } from "next/server"

import {
  isInternalApiAuthorized,
  isInternalApiConfigured,
  unauthorizedInternalApiResponse,
} from "@/lib/server/internal-api-auth"
import { listCreatorPilotApplications } from "@/lib/server/creator-pilot"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function GET(request: NextRequest) {
  if (!isInternalApiConfigured() || !isInternalApiAuthorized(request)) {
    return unauthorizedInternalApiResponse()
  }

  const rawLimit = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10)
  const limit = Number.isSafeInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50
  const applications = await listCreatorPilotApplications(limit)

  return noStoreJson({
    ok: true,
    count: applications.length,
    applications,
    human_review_required: true,
    automatic_enrollment_enabled: false,
    automatic_publishing_enabled: false,
  })
}
