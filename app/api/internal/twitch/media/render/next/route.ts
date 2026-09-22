import { NextRequest, NextResponse } from "next/server"

import {
  authorizeMediaWorker,
  claimNextTwitchShortRenderJob,
} from "@/lib/server/twitch-short-render-jobs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  if (!(await authorizeMediaWorker(request.headers.get("authorization")))) {
    return json({ ok: false, code: "MEDIA_WORKER_UNAUTHORIZED" }, 401)
  }

  try {
    const claimed = await claimNextTwitchShortRenderJob()
    return json({ ok: true, ...claimed })
  } catch (error) {
    const code = error instanceof Error ? error.message : "TWITCH_SHORT_RENDER_CLAIM_FAILED"
    return json({ ok: false, code }, code === "TWITCH_SHORT_RENDER_NOT_CONFIGURED" ? 409 : 503)
  }
}
