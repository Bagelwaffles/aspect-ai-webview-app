import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { enqueueTwitchShortRender } from "@/lib/server/twitch-short-render-jobs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  clipId: z.string().trim().min(1).max(160),
  approved: z.literal(true),
}).strict()

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!auth.ok) return json({ ok: false, code: auth.code }, auth.status)

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ ok: false, code: "TWITCH_SHORT_RENDER_APPROVAL_REQUIRED" }, 400)

  try {
    const job = await enqueueTwitchShortRender(parsed.data.clipId)
    return json({ ok: true, job })
  } catch (error) {
    const code = error instanceof Error ? error.message : "TWITCH_SHORT_RENDER_ENQUEUE_FAILED"
    const status =
      code === "TWITCH_SHORT_RENDER_NOT_CONFIGURED" ||
      code === "TWITCH_MEDIA_IMPORT_REQUIRED" ||
      code === "TWITCH_VIDEO_ANALYSIS_REQUIRED" ||
      code === "TWITCH_VIDEO_ANALYSIS_REJECTED" ||
      code === "TWITCH_VIDEO_METADATA_REQUIRED" ? 409 :
      code === "TWITCH_MEDIA_QUEUE_NOT_FOUND" || code === "TWITCH_MEDIA_CLIP_NOT_FOUND" ? 404 : 503
    return json({ ok: false, code }, status)
  }
}
