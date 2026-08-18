import { NextRequest, NextResponse } from "next/server"

import { authenticateBrowserWorker, completeBrowserJob } from "@/lib/server/browser-control"

export async function POST(request: NextRequest) {
  try {
    const workerId = await authenticateBrowserWorker(request)
    if (!workerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body || typeof body.jobId !== "string" || typeof body.ok !== "boolean") {
      return NextResponse.json({ error: "invalid_result" }, { status: 400 })
    }

    const job = await completeBrowserJob(workerId, {
      jobId: body.jobId,
      ok: body.ok,
      title: typeof body.title === "string" ? body.title : undefined,
      finalUrl: typeof body.finalUrl === "string" ? body.finalUrl : undefined,
      text: typeof body.text === "string" ? body.text : undefined,
      error: typeof body.error === "string" ? body.error : undefined,
      durationMs: typeof body.durationMs === "number" ? body.durationMs : undefined,
      captureBase64: typeof body.captureBase64 === "string" ? body.captureBase64 : undefined,
      captureSha256: typeof body.captureSha256 === "string" ? body.captureSha256 : undefined,
    })
    return NextResponse.json({ ok: true, job })
  } catch (error) {
    const message = error instanceof Error ? error.message : "result_failed"
    const status = ["JOB_NOT_FOUND"].includes(message) ? 404 : ["JOB_NOT_CLAIMED_BY_WORKER"].includes(message) ? 409 : message === "BROWSER_CONTROL_STORAGE_UNAVAILABLE" ? 503 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
