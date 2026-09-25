import { NextRequest, NextResponse } from "next/server"

import {
  getCloudBrowserConfiguration,
  getCloudBrowserWorkerStatus,
} from "@/lib/server/cloud-browser-dispatch"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request)
  if (!auth.ok) {
    return NextResponse.json({ ok: false, code: auth.code }, { status: auth.status })
  }

  const config = getCloudBrowserConfiguration()
  if (!config.configured) {
    return NextResponse.json({
      ok: true,
      enabled: config.enabled,
      configured: false,
      paired: false,
      daemon: false,
    }, { headers: { "Cache-Control": "no-store" } })
  }

  try {
    const status = await getCloudBrowserWorkerStatus()
    return NextResponse.json({
      ok: true,
      enabled: config.enabled,
      configured: true,
      ...status,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      enabled: config.enabled,
      configured: true,
      code: error instanceof Error ? error.message : "CLOUD_BROWSER_STATUS_FAILED",
    }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
