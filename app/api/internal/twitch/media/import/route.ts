import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { importTwitchClipMedia } from "@/lib/server/twitch-media-factory"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

const bodySchema = z.object({ clipId: z.string().trim().min(1).max(160) }).strict()

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!auth.ok) return json({ ok: false, code: auth.code }, auth.status)

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ ok: false, code: "TWITCH_MEDIA_CLIP_INVALID" }, 400)

  try {
    const result = await importTwitchClipMedia(parsed.data.clipId)
    return json({ ok: true, ...result })
  } catch (error) {
    const code = error instanceof Error ? error.message : "TWITCH_MEDIA_IMPORT_FAILED"
    const status =
      code === "TWITCH_MEDIA_SCOPE_REQUIRED" ? 409 :
      code === "TWITCH_MEDIA_CLIP_NOT_FOUND" || code === "TWITCH_MEDIA_QUEUE_NOT_FOUND" ? 404 :
      code === "TWITCH_MEDIA_DOWNLOAD_UNAVAILABLE" ? 409 : 503
    return json({ ok: false, code }, status)
  }
}
