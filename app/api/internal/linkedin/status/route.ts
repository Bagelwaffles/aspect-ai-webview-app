import { NextRequest, NextResponse } from "next/server"

import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { getLinkedInOrganizationConnectionStatus } from "@/lib/server/linkedin-organization-connection"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request)
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: { code: "OWNER_SESSION_REQUIRED" } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    )
  }

  const status = await getLinkedInOrganizationConnectionStatus()
  return NextResponse.json(
    { ok: true, executionPerformed: false, ...status },
    { headers: { "Cache-Control": "no-store" } },
  )
}
