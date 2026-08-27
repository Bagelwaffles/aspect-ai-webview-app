import { NextRequest, NextResponse } from "next/server"

import { planBrowserOperator } from "@/lib/server/browser-operator-agent"
import {
  browserAdminAuthorized,
  createBrowserJob,
  getBrowserControlSnapshot,
} from "@/lib/server/browser-control"

function sanitizeUrlForModel(rawUrl?: string) {
  if (!rawUrl) return undefined
  try {
    const url = new URL(rawUrl)
    url.username = ""
    url.password = ""
    url.search = ""
    url.hash = ""
    return url.toString()
  } catch {
    return undefined
  }
}

export async function POST(request: NextRequest) {
  if (!(await browserAdminAuthorized(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 2_000) : ""
  if (!message) return NextResponse.json({ error: "message_required" }, { status: 400 })

  try {
    const snapshot = await getBrowserControlSnapshot()
    if (!snapshot.configured) return NextResponse.json({ error: "BROWSER_CONTROL_STORAGE_UNAVAILABLE" }, { status: 503 })
    if (snapshot.killSwitch) return NextResponse.json({ error: "BROWSER_CONTROL_DISABLED" }, { status: 423 })

    const contextJob = snapshot.jobs.find((job) => job.status === "succeeded" && job.result?.finalUrl)
    const currentUrl = sanitizeUrlForModel(contextJob?.result?.finalUrl)
    const currentTitle = contextJob?.result?.title
    const descriptionJob = snapshot.jobs.find((job) =>
      job.action === "describe" &&
      job.status === "succeeded" &&
      Boolean(job.result?.text) &&
      (!currentUrl || sanitizeUrlForModel(job.result?.finalUrl) === currentUrl),
    )

    const planned = await planBrowserOperator({
      goal: message,
      currentUrl,
      currentTitle,
      pageDescription: descriptionJob?.result?.text,
      recentJobs: snapshot.jobs.slice(0, 8).map((job) => ({
        action: job.action,
        status: job.status,
        url: sanitizeUrlForModel(job.url) || "https://www.aspectmarketingsolutions.app/",
        error: job.error,
      })),
    })

    if (!planned.proposedJob) {
      return NextResponse.json({ reply: planned.reply, state: planned.state, job: null })
    }

    const job = await createBrowserJob({
      action: planned.proposedJob.action,
      url: planned.proposedJob.url,
      selector: planned.proposedJob.selector,
      value: planned.proposedJob.value,
      secretRef: planned.proposedJob.secretRef,
      useCurrentPage: planned.proposedJob.useCurrentPage,
      note: `Browser Agent: ${planned.proposedJob.rationale}`,
    })

    return NextResponse.json({
      reply: planned.reply,
      state: planned.state,
      job,
      rationale: planned.proposedJob.rationale,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "browser_operator_failed"
    const status = message === "AMS_AGENT_RUNTIME_UNAVAILABLE" ? 503 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
