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
import { reconcileNextEligiblePublicPromotion } from "@/lib/server/youtube-public-auto-queue"
import {
  getYouTubePrivateUploadRecord,
  getYouTubePrivateVerificationProof,
} from "@/lib/server/youtube-private-uploader"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

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

    const scan = await reconcileNextEligiblePublicPromotion(jobs, {
      getPromotionRecord: getYouTubePublicPromotionRecord,
      getPrivateUpload: getYouTubePrivateUploadRecord,
      getVerificationProof: getYouTubePrivateVerificationProof,
      promote: (renderJobId) => promoteRenderedTwitchShortPublic({
        renderJobId,
        approved: true,
      }),
    })

    if (scan.outcome) {
      const result = scan.outcome
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
        cappedSourceVideoIds: scan.cappedSourceVideoIds,
      }, ok ? 200 : record.status === "reconciliation" ? 409 : 502)
    }

    // Already-full streams are normal terminal work, not HTTP 409 failures.
    // Return diagnostic stream IDs so the worker can distinguish a true idle
    // cycle from a safely skipped, capped stream.
    return json({
      ok: true,
      attempted: false,
      skipped: scan.cappedSourceVideoIds.length > 0
        ? "YOUTUBE_PUBLIC_STREAM_CAP_REACHED"
        : "NO_VERIFIED_PUBLIC_PROMOTION_READY",
      cappedSourceVideoIds: scan.cappedSourceVideoIds,
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
