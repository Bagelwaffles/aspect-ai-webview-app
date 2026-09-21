import { NextRequest, NextResponse } from "next/server"

import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { disconnectLinkedInOrganization } from "@/lib/server/linkedin-organization-connection"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request)
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: { code: "OWNER_SESSION_REQUIRED" } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    )
  }

  await disconnectLinkedInOrganization()
  return NextResponse.json(
    { ok: true, disconnected: true, executionPerformed: true },
    { headers: { "Cache-Control": "no-store" } },
  )
}
