import { NextRequest, NextResponse } from "next/server"

import { createBrowserPairingCode } from "@/lib/server/browser-control"
import { pairCloudBrowserWorker } from "@/lib/server/cloud-browser-dispatch"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!auth.ok) {
    return NextResponse.json({ ok: false, code: auth.code }, { status: auth.status })
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
