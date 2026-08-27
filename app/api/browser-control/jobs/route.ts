import { NextRequest, NextResponse } from "next/server"

import { validateBrowserJobInput } from "@/lib/browser-control-policy"
import { browserAdminAuthorized, createBrowserJob } from "@/lib/server/browser-control"

export async function POST(request: NextRequest) {
  if (!(await browserAdminAuthorized(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = validateBrowserJobInput(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    return NextResponse.json({ job: await createBrowserJob(parsed.value) }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "job_creation_failed"
    const status = message === "BROWSER_CONTROL_STORAGE_UNAVAILABLE" ? 503 : message === "BROWSER_CONTROL_DISABLED" ? 423 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
