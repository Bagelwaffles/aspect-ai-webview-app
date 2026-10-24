/**
 * Signed-in AMS owner POST-only, Preview branch-only provider reachability.
 * No customer traffic, payment, domain verification or email is initiated.
 */
import { NextRequest, NextResponse } from "next/server"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { probeOwnerPilotProviderConnectivity } from "@/lib/server/quick-audit-owner-connectivity"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function denied(code: string, status: number) {
  return NextResponse.json({ ok: false, code }, {
    status, headers: { "Cache-Control": "no-store" },
  })
}

export async function POST(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!auth.ok) return denied(auth.code, auth.status)
  const result = await probeOwnerPilotProviderConnectivity({ env: process.env })
  return NextResponse.json(result, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function GET() {
  return denied("OWNER_CONNECTIVITY_POST_ONLY", 405)
}
