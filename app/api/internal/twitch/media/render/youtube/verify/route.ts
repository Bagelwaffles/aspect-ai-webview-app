import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { authorizeMediaWorker } from "@/lib/server/twitch-short-render-jobs"
import {
  getYouTubePrivateUploadRecord,
  verifyRenderedTwitchShortPrivate,
} from "@/lib/server/youtube-private-uploader"
import { SMOKYBANANA03_YOUTUBE_CHANNEL_ID } from "@/lib/server/youtube-owner-connection"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const requestSchema = z.object({
  renderJobId: z.string().min(1).max(200),
}).strict()

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

/**
 * Strictly read-only verification of an existing successful Private YouTube
 * upload. This endpoint can persist a verification proof in AMS Redis, but
 * never uploads, reuploads, changes privacy, or selects any video to publish.
 */
export async function POST(request: NextRequest) {
  if (!(await authorizeMediaWorker(request.headers.get("authorization")))) {
    return json({ ok: false, code: "MEDIA_WORKER_UNAUTHORIZED" }, 401)
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return json({ ok: false, code: "YOUTUBE_VERIFICATION_INPUT_INVALID" }, 400)
  }

  try {
    const record = await getYouTubePrivateUploadRecord(parsed.data.renderJobId)
    if (
      record?.status !== "succeeded" ||
      !record.youtubeVideoId ||
      record.channelId !== SMOKYBANANA03_YOUTUBE_CHANNEL_ID
    ) {
      return json({ ok: false, code: "YOUTUBE_VERIFICATION_VERIFIED_UPLOAD_REQUIRED" }, 409)
    }

    try {
      const proof = await verifyRenderedTwitchShortPrivate(parsed.data.renderJobId)
      if (proof.videoId !== record.youtubeVideoId ||
          proof.channelId !== SMOKYBANANA03_YOUTUBE_CHANNEL_ID) {
        return json({ ok: false, code: "YOUTUBE_VERIFICATION_PROOF_MISMATCH" }, 409)
      }
      return json({
        ...proof,
        ok: true,
        pendingVerification: false,
        status: record.status,
        privacyStatus: "private",
        videoId: record.youtubeVideoId,
        channelId: record.channelId,
        channelVerified: true,
        reused: true,
        code: null,
      })
    } catch (error) {
      const code = error instanceof Error ? error.message : "YOUTUBE_PRIVATE_VERIFICATION_FAILED"
      const pending = code === "YOUTUBE_UPLOAD_METADATA_TAGS_MISMATCH"
      return json({
        ok: false,
        pendingVerification: pending,
        status: record.status,
        privacyStatus: "private",
        videoId: record.youtubeVideoId,
        channelId: record.channelId,
        channelVerified: true,
        reused: true,
        code,
      }, pending ? 202 : 409)
    }
  } catch {
    return json({ ok: false, code: "YOUTUBE_VERIFICATION_STORE_UNAVAILABLE" }, 503)
  }
}
