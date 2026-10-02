import { NextRequest, NextResponse } from "next/server"

import { startCloudBrowserLoginSession } from "@/lib/server/cloud-browser-dispatch"
import { browserAdminAuthorized } from "@/lib/server/browser-control"
import { requestHasTrustedAppOrigin } from "@/lib/server/request-origin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  if (!(await browserAdminAuthorized(request))) {
    return NextResponse.json({ ok: false, code: "BROWSER_ADMIN_REQUIRED" }, { status: 401 })
  }
  if (!requestHasTrustedAppOrigin(request)) {
    return NextResponse.json({ ok: false, code: "UNTRUSTED_ORIGIN" }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const targetUrl = typeof body?.targetUrl === "string" ? body.targetUrl.trim().slice(0, 500) : undefined
  const result = await startCloudBrowserLoginSession(targetUrl)
  const ok = result.status === "ready"

  return NextResponse.json(
    { ok, ...result },
    {
      status: ok ? 200 : result.status === "not_configured" ? 409 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  )
}
