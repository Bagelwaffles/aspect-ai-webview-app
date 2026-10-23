/**
 * Authenticated read-only AMS Resend Preview configuration preflight.
 * Never returns env values. GET only: no checkout, mail, storage, or mutation.
 */
import { NextRequest, NextResponse } from "next/server"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { inspectResendPreviewPreflight } from "@/lib/server/quick-audit-resend-preview-preflight"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request)
  if (!auth.ok) {
    return NextResponse.json({ ok: false, code: auth.code }, {
      status: auth.status,
      headers: { "Cache-Control": "no-store" },
    })
  }
  const result = inspectResendPreviewPreflight()
  return NextResponse.json({
    ok: result.status === "configuration-ready",
    ...result,
    sendsEnabled: false,
  }, {
    status: result.status === "configuration-ready" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  })
}
