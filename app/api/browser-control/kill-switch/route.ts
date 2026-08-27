import { NextRequest, NextResponse } from "next/server"

import { browserAdminAuthorized } from "@/lib/server/browser-control"
import { setVerifiedBrowserKillSwitch } from "@/lib/server/browser-kill-switch"

export async function POST(request: NextRequest) {
  if (!(await browserAdminAuthorized(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body.disabled !== "boolean") {
    return NextResponse.json({ error: "disabled must be a boolean" }, { status: 400 })
  }

  try {
    const disabled = await setVerifiedBrowserKillSwitch(body.disabled)
    return NextResponse.json({ ok: true, disabled })
  } catch (error) {
    const message = error instanceof Error ? error.message : "kill_switch_failed"
    return NextResponse.json({ error: message }, { status: message === "BROWSER_CONTROL_STORAGE_UNAVAILABLE" ? 503 : 500 })
  }
}
