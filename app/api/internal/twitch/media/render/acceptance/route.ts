import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  authorizeMediaWorker,
  enqueueTwitchShortRender,
} from "@/lib/server/twitch-short-render-jobs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  clipId: z.string().trim().min(1).max(160),
}).strict()

function clean(value: string | undefined) {
  const result = value?.trim()
  return result || null
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  if (!authorizeMediaWorker(request.headers.get("authorization"))) {
    return json({ ok: false, code: "MEDIA_WORKER_UNAUTHORIZED" }, 401)
  }

  const allowedClipId = clean(process.env.AMS_TWITCH_SHORT_ACCEPTANCE_CLIP_ID)
  if (!allowedClipId) {
    return json({ ok: false, code: "TWITCH_SHORT_ACCEPTANCE_DISABLED" }, 409)
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success || parsed.data.clipId !== allowedClipId) {
    return json({ ok: false, code: "TWITCH_SHORT_ACCEPTANCE_CLIP_NOT_ALLOWED" }, 403)
  }

  try {
    const job = await enqueueTwitchShortRender(parsed.data.clipId)
    return json({ ok: true, job })
  } catch (error) {
    const code = error instanceof Error ? error.message : "TWITCH_SHORT_ACCEPTANCE_ENQUEUE_FAILED"
    const status =
      code === "TWITCH_SHORT_RENDER_NOT_CONFIGURED" || code === "TWITCH_MEDIA_IMPORT_REQUIRED" ? 409 :
      code === "TWITCH_MEDIA_QUEUE_NOT_FOUND" || code === "TWITCH_MEDIA_CLIP_NOT_FOUND" ? 404 : 503
    return json({ ok: false, code }, status)
  }
}
