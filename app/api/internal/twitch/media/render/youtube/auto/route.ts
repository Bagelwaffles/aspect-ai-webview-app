import { NextRequest, NextResponse } from "next/server"

import {
  authorizeMediaWorker,
  listLatestTwitchShortRenderJobs,
} from "@/lib/server/twitch-short-render-jobs"
import {
  getYouTubePrivateUploadRecord,
  getYouTubePrivateVerificationProof,
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
    const jobs = (await listLatestTwitchShortRenderJobs())
      .filter((job) => job.status === "rendered" && Boolean(job.publishMetadata?.youtube))

    // Phase 1: prove every existing successful upload before any new upload is allowed.
    for (const job of jobs) {
      const existing = await getYouTubePrivateUploadRecord(job.jobId)
      if (existing?.status !== "succeeded" || !existing.youtubeVideoId) continue

      const proof = await getYouTubePrivateVerificationProof(job.jobId)
      if (proof?.videoId === existing.youtubeVideoId) continue

      try {
        const verification = await verifyRenderedTwitchShortPrivate(job.jobId)
        return json({
          ...verification,
          ok: true,
          attempted: false,
          verificationAttempted: true,
          pendingVerification: false,
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

    // Phase 2: once all prior successful uploads have durable proof, upload at most one new render.
    for (const job of jobs) {
      const existing = await getYouTubePrivateUploadRecord(job.jobId)
      if (existing?.status === "succeeded") continue

      if (existing?.status === "uploading" || existing?.status === "reconciliation") {
        return json({
          ok: false,
          attempted: false,
          verificationAttempted: false,
          renderJobId: job.jobId,
          clipId: job.clipId,
          status: existing.status,
          privacyStatus: existing.privacyStatus,
          videoId: existing.youtubeVideoId,
          attempts: existing.attempts,
          reused: true,
          code: "YOUTUBE_UPLOAD_RECONCILIATION_REQUIRED",
        }, 409)
      }

      if ((existing?.attempts ?? 0) >= MAX_PRIVATE_UPLOAD_ATTEMPTS) {
        return json({
          ok: false,
          attempted: false,
          verificationAttempted: false,
          renderJobId: job.jobId,
          clipId: job.clipId,
          status: existing?.status ?? "failed",
          privacyStatus: existing?.privacyStatus ?? "private",
          videoId: existing?.youtubeVideoId ?? null,
          attempts: existing?.attempts ?? MAX_PRIVATE_UPLOAD_ATTEMPTS,
          reused: Boolean(existing),
          code: "YOUTUBE_PRIVATE_UPLOAD_ATTEMPTS_EXHAUSTED",
        }, 409)
      }

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
          pendingVerification: false,
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
