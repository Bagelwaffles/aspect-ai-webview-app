import { NextRequest, NextResponse } from "next/server"

import {
  authorizeMediaWorker,
  listLatestTwitchShortRenderJobs,
} from "@/lib/server/twitch-short-render-jobs"
import {
  getYouTubePrivateUploadRecord,
  uploadRenderedTwitchShortPrivate,
  verifyRenderedTwitchShortPrivate,
} from "@/lib/server/youtube-private-uploader"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const MAX_PRIVATE_UPLOAD_ATTEMPTS = 3
const TAGS_PENDING_CODE = "YOUTUBE_UPLOAD_METADATA_TAGS_MISMATCH"

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

function verificationStatus(code: string) {
  return code === TAGS_PENDING_CODE ? 202 : 500
}

export async function POST(request: NextRequest) {
  if (!(await authorizeMediaWorker(request.headers.get("authorization")))) {
    return json({ ok: false, code: "MEDIA_WORKER_UNAUTHORIZED" }, 401)
  }

  try {
    const jobs = await listLatestTwitchShortRenderJobs()

    for (const job of jobs) {
      if (job.status !== "rendered" || !job.publishMetadata?.youtube) continue

      const existing = await getYouTubePrivateUploadRecord(job.jobId)

      if (existing?.status === "succeeded") {
        try {
          const verification = await verifyRenderedTwitchShortPrivate(job.jobId)
          return json({
            ...verification,
            ok: true,
            attempted: false,
            verificationAttempted: true,
            renderJobId: job.jobId,
            clipId: job.clipId,
            status: existing.status,
            privacyStatus: existing.privacyStatus,
            videoId: existing.youtubeVideoId,
            attempts: existing.attempts,
            reused: true,
          })
        } catch (error) {
          const code = error instanceof Error ? error.message : "YOUTUBE_PRIVATE_UPLOAD_VERIFY_FAILED"
          return json({
            ok: false,
            attempted: false,
            verificationAttempted: true,
            pendingVerification: code === TAGS_PENDING_CODE,
            renderJobId: job.jobId,
            clipId: job.clipId,
            status: existing.status,
            privacyStatus: existing.privacyStatus,
            videoId: existing.youtubeVideoId,
            attempts: existing.attempts,
            reused: true,
            code,
          }, verificationStatus(code))
        }
      }

      if (existing?.status === "uploading" || existing?.status === "reconciliation") continue
      if ((existing?.attempts ?? 0) >= MAX_PRIVATE_UPLOAD_ATTEMPTS) continue

      const result = await uploadRenderedTwitchShortPrivate({
        renderJobId: job.jobId,
        approved: true,
      })
      const record = result.record

      if (record.status !== "succeeded") {
        return json({
          ok: false,
          attempted: true,
          verificationAttempted: false,
          renderJobId: job.jobId,
          clipId: job.clipId,
          status: record.status,
          privacyStatus: record.privacyStatus,
          videoId: record.youtubeVideoId,
          attempts: record.attempts,
          reused: result.reused,
          code: record.errorCode,
        }, 502)
      }

      try {
        const verification = await verifyRenderedTwitchShortPrivate(job.jobId)
        return json({
          ...verification,
          ok: true,
          attempted: true,
          verificationAttempted: true,
          renderJobId: job.jobId,
          clipId: job.clipId,
          status: record.status,
          privacyStatus: record.privacyStatus,
          videoId: record.youtubeVideoId,
          attempts: record.attempts,
          reused: result.reused,
        })
      } catch (error) {
        const code = error instanceof Error ? error.message : "YOUTUBE_PRIVATE_UPLOAD_VERIFY_FAILED"
        return json({
          ok: false,
          attempted: true,
          verificationAttempted: true,
          pendingVerification: code === TAGS_PENDING_CODE,
          renderJobId: job.jobId,
          clipId: job.clipId,
          status: record.status,
          privacyStatus: record.privacyStatus,
          videoId: record.youtubeVideoId,
          attempts: record.attempts,
          reused: result.reused,
          code,
        }, verificationStatus(code))
      }
    }

    return json({
      ok: true,
      attempted: false,
      verificationAttempted: false,
      skipped: "NO_PENDING_PRIVATE_UPLOAD",
    })
  } catch (error) {
    const code = error instanceof Error ? error.message : "YOUTUBE_PRIVATE_UPLOAD_RECONCILE_FAILED"
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
