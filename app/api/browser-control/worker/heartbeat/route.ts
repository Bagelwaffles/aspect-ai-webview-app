import { NextRequest, NextResponse } from "next/server"

import { authenticateBrowserWorker, recordBrowserHeartbeat } from "@/lib/server/browser-control"

export async function POST(request: NextRequest) {
  try {
    const workerId = await authenticateBrowserWorker(request)
    if (!workerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const result = await recordBrowserHeartbeat(workerId, {
      version: typeof body.version === "string" ? body.version : undefined,
      platform: typeof body.platform === "string" ? body.platform : undefined,
      browser: typeof body.browser === "string" ? body.browser : undefined,
      currentJobId:
        body.currentJobId === null || typeof body.currentJobId === "string"
          ? body.currentJobId
          : undefined,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "heartbeat_failed"
    return NextResponse.json({ error: message }, { status: message === "BROWSER_CONTROL_STORAGE_UNAVAILABLE" ? 503 : 500 })
  }
}
