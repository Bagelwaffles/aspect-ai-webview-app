import { NextRequest, NextResponse } from "next/server"

import { dispatchCloudBrowserWorker } from "@/lib/server/cloud-browser-dispatch"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!auth.ok) {
    return NextResponse.json({ ok: false, code: auth.code }, { status: auth.status })
  }

  const result = await dispatchCloudBrowserWorker({ force: true })
  const ok = result.status === "dispatched"
  return NextResponse.json(
    { ok, ...result },
    { status: ok ? 200 : result.status === "not_configured" ? 409 : 503, headers: { "Cache-Control": "no-store" } },
  )
}
