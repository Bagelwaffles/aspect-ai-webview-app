import { isYouTubePublicAutopublishEnabled } from "@/lib/server/youtube-public-promoter"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { authorizeMediaWorker } from "@/lib/server/twitch-short-render-jobs"
import { runAutomaticTwitchMetadata } from "@/lib/server/twitch-live-automation"
import { startTwitchCatchup, beginTwitchVodUpload, claimTwitchVod, completeTwitchVod, getTwitchCatchupStatus, recordTwitchCatchupWorker, runTwitchClipCatchup, publishVerifiedTwitchVods, setTwitchVodThumbnail } from "@/lib/server/twitch-catchup"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300
const vodId = z.string().regex(/^\d+$/)
const lease = z.string().uuid()
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status") }).strict(),
  z.object({ action: z.literal("clips") }).strict(),
  z.object({ action: z.literal("publish") }).strict(),
  z.object({ action: z.literal("next") }).strict(),
  z.object({ action: z.literal("heartbeat"), phase: z.enum(["started", "succeeded", "failed"]),
    trigger: z.string().min(1).max(40), errorCode: z.string().max(100).optional() }).strict(),
  z.object({ action: z.literal("begin"), vodId, lease, bytes: z.number().int().positive() }).strict(),
  z.object({ action: z.literal("thumbnail"), vodId, lease, videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
    jpegBase64: z.string().min(1000).max(3_000_000) }).strict(),
  z.object({ action: z.literal("complete"), vodId, lease, videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/).optional(), errorCode: z.string().max(100).optional() }).strict(),
])
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } }) }
export async function POST(request: NextRequest) {
  if (!await authorizeMediaWorker(request.headers.get("authorization"))) return json({ ok: false, code: "MEDIA_WORKER_UNAUTHORIZED" }, 401)
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ ok: false, code: "TWITCH_CATCHUP_INPUT_INVALID" }, 400)
  try {
    const body = parsed.data
    if (body.action === "status") {
      await runAutomaticTwitchMetadata().catch(() => console.error("TWITCH_LIVE_METADATA_FAILED"))
      // Discover first, even when the old queue is empty. Delayed Twitch VOD
      // availability is recovered by the next scheduled worker check.
      await startTwitchCatchup({}, false).catch(error => {
        if (!(error instanceof Error) || error.message !== "TWITCH_CATCHUP_BUSY") throw error
      })
      const { plan, jobs } = await getTwitchCatchupStatus()
      return json({ ok: true, hasWork: Boolean(plan && plan.clipCursor < plan.clipVodIds.length) ||
        jobs.some(job => job.status === "pending" || job.status === "rendering" || job.status === "blocked" || (job.status === "failed" && job.errorCode === "YOUTUBE_CONNECTION_VAULT_UNAVAILABLE" && !job.youtubeVideoId) || (job.status === "verified" && isYouTubePublicAutopublishEnabled())) })
    }
    if (body.action === "publish") return json({ ok: true, result: await publishVerifiedTwitchVods() })
    if (body.action === "clips") return json({ ok: true, result: await runTwitchClipCatchup() })
    if (body.action === "next") return json({ ok: true, job: await claimTwitchVod() })
    if (body.action === "heartbeat") return json({ ok: true, worker: await recordTwitchCatchupWorker(body) })
    if (body.action === "begin") return json({ ok: true, ...await beginTwitchVodUpload(body) })
    if (body.action === "thumbnail") return json({ ok: true, thumbnail: await setTwitchVodThumbnail(body) })
    return json({ ok: true, job: await completeTwitchVod(body) })
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    const code = /^(TWITCH|YOUTUBE)_[A-Z0-9_]+$/.test(message) ? message : "TWITCH_CATCHUP_WORKER_FAILED"
    return json({ ok: false, code }, 503)
  }
}
