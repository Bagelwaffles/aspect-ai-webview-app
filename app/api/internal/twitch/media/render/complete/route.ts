import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  authorizeMediaWorker,
  completeTwitchShortRenderJob,
} from "@/lib/server/twitch-short-render-jobs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  jobId: z.string().trim().min(1).max(200),
  ok: z.boolean(),
  errorCode: z.string().trim().max(200).nullable().optional(),
}).strict()

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  if (!authorizeMediaWorker(request.headers.get("authorization"))) {
    return json({ ok: false, code: "MEDIA_WORKER_UNAUTHORIZED" }, 401)
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ ok: false, code: "MEDIA_WORKER_RESULT_INVALID" }, 400)

  try {
    const job = await completeTwitchShortRenderJob(parsed.data)
    return json({ ok: true, job })
  } catch (error) {
    const code = error instanceof Error ? error.message : "TWITCH_SHORT_RENDER_COMPLETE_FAILED"
    const status = code === "TWITCH_SHORT_RENDER_JOB_NOT_FOUND" ? 404 : 409
    return json({ ok: false, code }, status)
  }
}
