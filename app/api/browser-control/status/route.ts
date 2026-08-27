import { NextRequest, NextResponse } from "next/server"

import { browserAdminAuthorized, getBrowserControlSnapshot } from "@/lib/server/browser-control"
import { browserKillSwitchEnabled } from "@/lib/server/browser-kill-switch"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  if (!(await browserAdminAuthorized(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const snapshot = await getBrowserControlSnapshot()
  const killSwitch = snapshot.configured ? await browserKillSwitchEnabled() : true
  return NextResponse.json({
    ...snapshot,
    killSwitch,
    worker: snapshot.worker ? { ...snapshot.worker, online: snapshot.worker.online && !killSwitch } : null,
  }, { headers: { "Cache-Control": "no-store" } })
}
