import { NextRequest, NextResponse } from "next/server"

import { authenticateBrowserWorker, claimBrowserJob } from "@/lib/server/browser-control"

export async function POST(request: NextRequest) {
  try {
    const workerId = await authenticateBrowserWorker(request)
    if (!workerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    return NextResponse.json(await claimBrowserJob(workerId), {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "claim_failed"
    return NextResponse.json({ error: message }, { status: message === "BROWSER_CONTROL_STORAGE_UNAVAILABLE" ? 503 : 500 })
  }
}
