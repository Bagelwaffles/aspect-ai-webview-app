import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { completeSmokyYouTubeVodUpload } from "@/lib/server/smoky-youtube-vod-jobs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  jobId: z.string().uuid(),
  ok: z.boolean(),
  youtubeVideoId: z.string().trim().min(1).max(200).nullable().optional(),
  errorCode: z.string().trim().max(200).nullable().optional(),
  retriable: z.boolean().optional(),
  uncertain: z.boolean().optional(),
  sessionExpired: z.boolean().optional(),
}).strict()

function bearer(request: NextRequest) {
  const value = request.headers.get("authorization")
  return value?.startsWith("Bearer ") ? value.slice("Bearer ".length).trim() : ""
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ ok: false, code: "SMOKY_VOD_UPLOAD_RESULT_INVALID" }, 400)

  try {
    const job = await completeSmokyYouTubeVodUpload({
      ...parsed.data,
      leaseToken: bearer(request),
    })
    return json({ ok: true, job })
  } catch (error) {
    const code = error instanceof Error ? error.message : "SMOKY_VOD_UPLOAD_COMPLETE_FAILED"
    const status = code.includes("LEASE_INVALID") ? 401 : code.includes("NOT_FOUND") ? 404 : 409
    return json({ ok: false, code }, status)
  }
}
