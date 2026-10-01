import { NextRequest, NextResponse } from "next/server"

import {
  authorizeMediaWorker,
} from "@/lib/server/twitch-short-render-jobs"
import {
  uploadRenderedTwitchShortPrivate,
  verifyRenderedTwitchShortPrivate,
} from "@/lib/server/youtube-private-uploader"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function POST(request: NextRequest) {
  if (!(await authorizeMediaWorker(request.headers.get("authorization")))) {
    return json({ ok: false, code: "MEDIA_WORKER_UNAUTHORIZED" }, 401)
  }

  const body = await request.json().catch(() => null) as {
    renderJobId?: unknown
    approved?: unknown
  } | null
  const renderJobId = typeof body?.renderJobId === "string" ? body.renderJobId.trim() : ""
  const approved = body?.approved === true

  if (!renderJobId) return json({ ok: false, code: "YOUTUBE_RENDER_JOB_ID_REQUIRED" }, 400)
  if (!approved) return json({ ok: false, code: "YOUTUBE_PRIVATE_UPLOAD_APPROVAL_REQUIRED" }, 403)

  try {
    const result = await uploadRenderedTwitchShortPrivate({
      renderJobId,
      approved: true,
    })

    const record = result.record
    const ok = record.status === "succeeded"
    const status =
      ok ? 200 :
      record.status === "reconciliation" ? 409 :
      record.errorCode === "YOUTUBE_UPLOADER_NOT_CONFIGURED" ? 503 :
      502

    if (ok) {
      try {
        const verification = await verifyRenderedTwitchShortPrivate(renderJobId)
        return json({
          ...verification,
          ok: true,
          pendingVerification: false,
          status: record.status,
          privacyStatus: record.privacyStatus,
          videoId: record.youtubeVideoId,
          channelVerified: Boolean(record.channelId),
          reused: result.reused,
          code: null,
        }, 200)
      } catch (error) {
        const code = error instanceof Error ? error.message : "YOUTUBE_PRIVATE_UPLOAD_VERIFY_FAILED"
        if (code === "YOUTUBE_UPLOAD_METADATA_TAGS_MISMATCH") {
          return json({
            ok: false,
            pendingVerification: true,
            status: record.status,
            privacyStatus: record.privacyStatus,
            videoId: record.youtubeVideoId,
            channelId: record.channelId,
            channelVerified: Boolean(record.channelId),
            reused: result.reused,
            code,
          }, 202)
        }
        throw error
      }
    }

    return json({
      ok: false,
      pendingVerification: false,
      status: record.status,
      privacyStatus: record.privacyStatus,
      videoId: record.youtubeVideoId,
      channelVerified: Boolean(record.channelId),
      reused: result.reused,
      code: record.errorCode,
    }, status)
  } catch (error) {
    const code = error instanceof Error ? error.message : "YOUTUBE_PRIVATE_UPLOAD_FAILED"
    const status =
      code === "YOUTUBE_UPLOAD_STORE_UNAVAILABLE" ||
      code === "YOUTUBE_UPLOADER_NOT_CONFIGURED"
        ? 503
        : code === "YOUTUBE_UPLOAD_RECONCILIATION_REQUIRED"
          ? 409
          : 500
    return json({ ok: false, code }, status)
  }
}
