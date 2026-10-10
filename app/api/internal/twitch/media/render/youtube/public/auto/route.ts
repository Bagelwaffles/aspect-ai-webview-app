import { NextRequest, NextResponse } from "next/server"

import {
  authorizeMediaWorker,
  listLatestTwitchShortRenderJobs,
} from "@/lib/server/twitch-short-render-jobs"
import {
  getYouTubePublicPromotionRecord,
  isYouTubePublicAutopublishEnabled,
  promoteRenderedTwitchShortPublic,
} from "@/lib/server/youtube-public-promoter"
import {
  getYouTubePrivateUploadRecord,
  getYouTubePrivateVerificationProof,
} from "@/lib/server/youtube-private-uploader"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

const MAX_PUBLIC_PROMOTION_ATTEMPTS = 3

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

  if (!isYouTubePublicAutopublishEnabled()) {
    return json({
      ok: true,
      attempted: false,
      skipped: "YOUTUBE_PUBLIC_AUTOPUBLISH_DISABLED",
    })
  }

  try {
    const jobs = (await listLatestTwitchShortRenderJobs())
      .filter((job) =>
        job.status === "rendered" &&
        Boolean(job.publishMetadata?.youtube) &&
        Boolean(job.autoPublish),
      )
      .sort((left, right) => {
        const sourceCompare = String(right.autoPublish?.sourceVideoId ?? "")
          .localeCompare(String(left.autoPublish?.sourceVideoId ?? ""))
        if (sourceCompare) return sourceCompare
        return (left.autoPublish?.rank ?? 3) - (right.autoPublish?.rank ?? 3)
      })

    for (const job of jobs) {
      const existing = await getYouTubePublicPromotionRecord(job.jobId)
      if (existing?.status === "succeeded") continue

      // Even at the retry ceiling, an ambiguous PUT may already have succeeded.
      // Allow readback-only reconciliation; the promoter forbids further PUTs.
      const ambiguous = existing?.status === "promoting" || existing?.status === "reconciliation"
      if ((existing?.attempts ?? 0) >= MAX_PUBLIC_PROMOTION_ATTEMPTS && !ambiguous) {
        continue
      }

      const privateUpload = await getYouTubePrivateUploadRecord(job.jobId)
      if (privateUpload?.status !== "succeeded" || !privateUpload.youtubeVideoId) continue

      const proof = await getYouTubePrivateVerificationProof(job.jobId)
      if (proof?.videoId !== privateUpload.youtubeVideoId || proof.metadataVerified !== true) continue

      // The promoter verifies ambiguous prior PUTs against YouTube before any retry.
      // A 409 still fails closed if the original video cannot be safely reconciled.
      const result = await promoteRenderedTwitchShortPublic({
        renderJobId: job.jobId,
        approved: true,
      })
      const record = result.record
      const ok = record.status === "succeeded"

      return json({
        ok,
        attempted: true,
        renderJobId: record.renderJobId,
        clipId: record.clipId,
        sourceVideoId: record.sourceVideoId,
        rank: record.selectionRank,
        status: record.status,
        privacyStatus: ok ? "public" : "private",
        videoId: record.youtubeVideoId,
        channelId: record.channelId,
        attempts: record.attempts,
        reused: result.reused,
        code: record.errorCode,
      }, ok ? 200 : record.status === "reconciliation" ? 409 : 502)
    }

    return json({
      ok: true,
      attempted: false,
      skipped: "NO_VERIFIED_PUBLIC_PROMOTION_READY",
    })
  } catch (error) {
    const code = error instanceof Error ? error.message : "YOUTUBE_PUBLIC_AUTO_PROMOTION_FAILED"
    const status =
      code === "YOUTUBE_PUBLIC_STORE_UNAVAILABLE" ||
      code === "YOUTUBE_PUBLIC_OWNER_CONNECTION_REQUIRED"
        ? 503
        : code === "YOUTUBE_PUBLIC_EDIT_SCOPE_REQUIRED" ||
            code === "YOUTUBE_PUBLIC_PRIVATE_VERIFICATION_REQUIRED" ||
            code === "YOUTUBE_PUBLIC_STREAM_CAP_REACHED" ||
            code === "YOUTUBE_PUBLIC_RECONCILIATION_REQUIRED" ||
            code === "YOUTUBE_PUBLIC_ATTEMPT_LIMIT_REACHED"
          ? 409
          : 500
    return json({ ok: false, code }, status)
  }
}
