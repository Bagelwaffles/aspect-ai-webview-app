import { NextRequest, NextResponse } from "next/server"

import {
  authorizeMediaWorker,
  getLatestRenderedShortPreview,
} from "@/lib/server/twitch-short-render-jobs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function GET(request: NextRequest) {
  if (!(await authorizeMediaWorker(request.headers.get("authorization")))) {
    return json({ ok: false, code: "MEDIA_WORKER_UNAUTHORIZED" }, 401)
  }

  try {
    const result = await getLatestRenderedShortPreview()
    if (!result) return json({ ok: false, code: "TWITCH_SHORT_RENDER_PREVIEW_NOT_READY" }, 404)
    return json({ ok: true, ...result })
  } catch (error) {
    const code = error instanceof Error ? error.message : "TWITCH_SHORT_RENDER_EXPORT_FAILED"
    return json({ ok: false, code }, 503)
  }
}
