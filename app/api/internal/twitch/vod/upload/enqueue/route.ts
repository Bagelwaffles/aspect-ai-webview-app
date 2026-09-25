import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { enqueueSmokyYouTubeVodUpload } from "@/lib/server/smoky-youtube-vod-jobs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  twitchVodId: z.string().trim().min(1).max(160),
  sourceObjectKey: z.string().trim().min(1).max(1_000),
  metadata: z.object({
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(5_000),
    tags: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
    hashtags: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
    categoryId: z.string().trim().regex(/^\d{1,6}$/u).default("20"),
  }).strict(),
  approved: z.literal(true),
}).strict()

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!auth.ok) return json({ ok: false, code: auth.code }, auth.status)

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ ok: false, code: "SMOKY_VOD_UPLOAD_APPROVAL_REQUIRED" }, 400)

  try {
    const result = await enqueueSmokyYouTubeVodUpload(parsed.data)
    return json({ ok: true, ...result })
  } catch (error) {
    const code = error instanceof Error ? error.message : "SMOKY_VOD_UPLOAD_ENQUEUE_FAILED"
    const status =
      code === "SMOKY_VOD_SOURCE_OBJECT_INVALID" || code === "SMOKY_VOD_ID_INVALID" ? 400 :
      code.includes("NOT_CONFIGURED") ? 409 : 503
    return json({ ok: false, code }, status)
  }
}
