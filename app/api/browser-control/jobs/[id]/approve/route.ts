import { NextRequest, NextResponse } from "next/server"

import { approveBrowserJob, browserAdminAuthorized } from "@/lib/server/browser-control"
import { browserKillSwitchEnabled } from "@/lib/server/browser-kill-switch"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await browserAdminAuthorized(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { id } = await context.params
  try {
    if (await browserKillSwitchEnabled()) {
      return NextResponse.json({ error: "BROWSER_CONTROL_DISABLED" }, { status: 423 })
    }
    return NextResponse.json({ job: await approveBrowserJob(id) })
  } catch (error) {
    const message = error instanceof Error ? error.message : "approval_failed"
    const status = message === "JOB_NOT_FOUND" ? 404 : message === "JOB_NOT_AWAITING_APPROVAL" ? 409 : message === "BROWSER_CONTROL_DISABLED" ? 423 : message === "BROWSER_CONTROL_STORAGE_UNAVAILABLE" ? 503 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
