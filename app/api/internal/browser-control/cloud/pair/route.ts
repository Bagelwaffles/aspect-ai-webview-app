import { NextRequest, NextResponse } from "next/server"

import { browserAdminAuthorized, createBrowserPairingCode } from "@/lib/server/browser-control"
import { pairCloudBrowserWorker } from "@/lib/server/cloud-browser-dispatch"
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

  try {
    const pairing = await createBrowserPairingCode()
    const result = await pairCloudBrowserWorker(pairing.code)
    return NextResponse.json({
      ok: true,
      paired: true,
      workerId: typeof result.workerId === "string" ? result.workerId : null,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const code = error instanceof Error ? error.message : "CLOUD_BROWSER_PAIR_FAILED"
    const status = code.includes("NOT_CONFIGURED") ? 409 : 503
    return NextResponse.json({ ok: false, code }, { status })
  }
}
