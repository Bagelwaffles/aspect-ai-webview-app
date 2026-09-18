import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { createTwitchClipFromVod } from "@/lib/server/twitch-pilot"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  approved: z.literal(true),
  vodId: z.string().trim().min(1).max(160),
  vodOffset: z.number().int().min(5).max(60 * 60 * 48),
  duration: z.number().min(5).max(60).default(30),
  title: z.string().trim().min(1).max(100),
}).strict()

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!auth.ok) return json({ ok: false, code: auth.code }, auth.status)

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ ok: false, code: "TWITCH_VOD_CLIP_INPUT_INVALID" }, 400)

  try {
    const clip = await createTwitchClipFromVod(parsed.data)
    return json({ ok: true, clip, executionPerformed: true })
  } catch (error) {
    const code = error instanceof Error ? error.message : "TWITCH_VOD_CLIP_CREATE_FAILED"
    const status = code === "TWITCH_MEDIA_SCOPE_REQUIRED" ? 409 : 503
    return json({ ok: false, code, executionPerformed: false }, status)
  }
}
