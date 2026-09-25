import { NextRequest, NextResponse } from "next/server"

import { claimNextSmokyYouTubeVodUpload } from "@/lib/server/smoky-youtube-vod-jobs"
import { authorizeMediaWorker } from "@/lib/server/twitch-short-render-jobs"

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
    const claimed = await claimNextSmokyYouTubeVodUpload()
    return json({ ok: true, ...claimed })
  } catch (error) {
    const code = error instanceof Error ? error.message : "SMOKY_VOD_UPLOAD_CLAIM_FAILED"
    return json({ ok: false, code }, code.includes("NOT_CONFIGURED") ? 409 : 503)
  }
}
