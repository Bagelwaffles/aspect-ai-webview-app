import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import {
  analyzeTwitchClipVideo,
  isTwitchVideoAnalysisRenderEligible,
} from "@/lib/server/twitch-video-analysis"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  clipId: z.string().trim().min(1).max(160),
  force: z.boolean().optional().default(false),
}).strict()

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!auth.ok) return json({ ok: false, code: auth.code }, auth.status)

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ ok: false, code: "TWITCH_VIDEO_ANALYSIS_INPUT_INVALID" }, 400)

  try {
    const analysis = await analyzeTwitchClipVideo(parsed.data.clipId, { force: parsed.data.force })
    return json({
      ok: true,
      analysis,
      renderEligible: isTwitchVideoAnalysisRenderEligible(analysis),
    })
  } catch (error) {
    const code = error instanceof Error ? error.message : "TWITCH_VIDEO_ANALYSIS_FAILED"
    const status =
      code === "TWITCH_MEDIA_QUEUE_NOT_FOUND" || code === "TWITCH_MEDIA_CLIP_NOT_FOUND" ? 404 :
      code === "TWITCH_MEDIA_IMPORT_REQUIRED" || code === "TWITCH_VIDEO_ANALYSIS_RUNTIME_UNAVAILABLE" ? 409 :
      503
    return json({ ok: false, code }, status)
  }
}
