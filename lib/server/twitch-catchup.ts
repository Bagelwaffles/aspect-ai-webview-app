import { randomUUID } from "node:crypto"
import { Redis } from "@upstash/redis"
import { z } from "zod"
import { getTwitchPilotStatus, getTwitchRecentArchive, type TwitchRecentVod } from "./twitch-pilot"
import { runTwitchAutomaticPrivateShorts } from "./twitch-auto-factory"
import { getStoredYouTubeOwnerCredential, resolveYouTubeOAuthClient, SMOKYBANANA03_YOUTUBE_CHANNEL_ID, YOUTUBE_FORCE_SSL_SCOPE } from "./youtube-owner-connection"

import { isYouTubePublicAutopublishEnabled } from "./youtube-public-promoter"

const TTL = 180 * 24 * 3600
const INDEX = "ams:twitch-catchup:v1:index"
const PLAN = "ams:twitch-catchup:v1:plan"
const prefix = "ams:twitch-catchup:v1:vod:"
const jobSchema = z.object({
  vodId: z.string().regex(/^\d+$/), streamer: z.literal("SmokyBanana03"), title: z.string(),
  createdAt: z.string().datetime(), durationSeconds: z.number().positive(),
  status: z.enum(["pending", "rendering", "uploading", "verified", "published", "failed", "reconciliation"]),
  lease: z.string().nullable(), youtubeVideoId: z.string().nullable(), errorCode: z.string().nullable(),
  metadata: z.object({ title: z.string().max(100), description: z.string().max(5000) }),
}).strict()
export type TwitchVodJob = z.infer<typeof jobSchema>
type Store = Pick<Redis, "get" | "set" | "del">
type Options = { redis?: Store; env?: NodeJS.ProcessEnv; fetcher?: typeof fetch }
function db(options: Options): Store {
  if (options.redis) return options.redis
  const env = options.env ?? process.env
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN
  if (!url || !token) throw new Error("TWITCH_CATCHUP_STORE_UNAVAILABLE")
  return new Redis({ url, token })
}
async function read<T>(redis: Store, key: string): Promise<T | null> {
  const raw = await redis.get<unknown>(key)
  return raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) as T : null
}
async function save(job: TwitchVodJob, redis: Store) {
  await redis.set(prefix + job.vodId, JSON.stringify(jobSchema.parse(job)), { ex: TTL })
  return job
}
export function vodMetadata(vod: Pick<TwitchRecentVod, "id" | "title" | "createdAt">) {
  const date = vod.createdAt.slice(0, 10)
  return {
    title: `SmokyBanana03 | ${date} | Full Stream | ${vod.title}`.slice(0, 100),
    description: `Full Twitch stream from SmokyBanana03, recorded ${date}.\n\n${vod.title.slice(0, 1000)}\n\nStreamer: SmokyBanana03\nSource: https://www.twitch.tv/videos/${vod.id}\nFollow: https://www.twitch.tv/smokybanana03\n\nCreated by Aspect Marketing Solutions (AMS)\nhttps://www.aspectmarketingsolutions.app\n\nIncludes a 5-second introduction and a 7-second outro. Original stream footage is preserved.\n#SmokyBanana03 #TwitchVOD #Gaming`,
  }
}
export async function getTwitchCatchupStatus(options: Options = {}) {
  const redis = db(options)
  const ids = await read<string[]>(redis, INDEX) ?? []
  const jobs = await Promise.all(ids.map(id => read<TwitchVodJob>(redis, prefix + id)))
  // No OAuth tokens or resumable upload session URLs are stored in or exposed by this status.
  return { plan: await read<{ clipVodIds: string[]; clipCursor: number; endedAt: string; startedAt: string; clipFailures?: string[] }>(redis, PLAN),
    jobs: jobs.filter((job): job is TwitchVodJob => Boolean(job)) }
}
export async function startTwitchCatchup(options: Options = {}) {
  const redis = db(options)
  const lock = "ams:twitch-catchup:v1:start-lock"
  if (!await redis.set(lock, "locked", { nx: true, ex: 120 })) throw new Error("TWITCH_CATCHUP_BUSY")
  try {
    const status = await getTwitchPilotStatus({ env: options.env })
    if (!status.connected || status.connection?.login.toLowerCase() !== "smokybanana03") throw new Error("TWITCH_CATCHUP_CHANNEL_MISMATCH")
    const archive = await getTwitchRecentArchive(31 * 24, { env: options.env })
    const monthStart = new Date(archive.endedAt)
    monthStart.setUTCMonth(monthStart.getUTCMonth() - 1)
    const vods = archive.vods.filter(vod => Date.parse(vod.createdAt) >= monthStart.getTime())
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    const existingIds = await read<string[]>(redis, INDEX) ?? []
    for (const vod of vods) {
      if (!/^\d+$/.test(vod.id) || !vod.durationSeconds) continue
      if (await read(redis, prefix + vod.id)) continue
      await save({ vodId: vod.id, streamer: "SmokyBanana03", title: vod.title, createdAt: vod.createdAt,
        durationSeconds: vod.durationSeconds, status: "pending", lease: null, youtubeVideoId: null,
        errorCode: null, metadata: vodMetadata(vod) }, redis)
    }
    await redis.set(INDEX, JSON.stringify([...new Set([...existingIds, ...vods.map(vod => vod.id)])]), { ex: TTL })
    const clipStart = new Date(Date.parse(archive.endedAt) - 14 * 24 * 3600_000).toISOString()
    const previous = await read<{ clipCursor: number; clipVodIds: string[] }>(redis, PLAN)
    if (!previous || previous.clipCursor >= previous.clipVodIds.length) {
      await redis.set(PLAN, JSON.stringify({ startedAt: clipStart, endedAt: archive.endedAt, clipCursor: 0,
        clipVodIds: vods.filter(vod => Date.parse(vod.createdAt) >= Date.parse(clipStart)).map(vod => vod.id) }), { ex: TTL })
    }
    return getTwitchCatchupStatus({ ...options, redis })
  } finally { await redis.del(lock) }
}
export async function runTwitchClipCatchup(options: Options = {}) {
  const redis = db(options)
  const state = await getTwitchCatchupStatus({ ...options, redis })
  const plan = state.plan
  if (!plan || plan.clipCursor >= plan.clipVodIds.length) return { skipped: "TWITCH_CATCHUP_COMPLETE" }
  const lock = "ams:twitch-catchup:v1:clip-lock"
  if (!await redis.set(lock, "locked", { nx: true, ex: 900 })) return { skipped: "TWITCH_CATCHUP_BUSY" }
  try {
    const result = await runTwitchAutomaticPrivateShorts({ vodId: plan.clipVodIds[plan.clipCursor],
      windowHours: 14 * 24, windowEnd: plan.endedAt, privateOnly: false })
    const pending = "pending" in result ? result.pending ?? 0 : 0
    if (!result.skipped && !result.failures.length && !pending) {
      await redis.set(PLAN, JSON.stringify({ ...plan, clipCursor: plan.clipCursor + 1, clipFailures: [] }), { ex: TTL })
    } else {
      await redis.set(PLAN, JSON.stringify({ ...plan, clipFailures: result.failures }), { ex: TTL })
    }
    return { ...result, vodId: plan.clipVodIds[plan.clipCursor], cursor: plan.clipCursor }
  } finally { await redis.del(lock) }
}
export async function claimTwitchVod(options: Options = {}) {
  const redis = db(options)
  const { jobs } = await getTwitchCatchupStatus({ ...options, redis })
  for (const job of [...jobs].sort((a, b) => a.durationSeconds - b.durationSeconds)) {
    if (job.status !== "pending" && job.status !== "rendering") continue
    const lease = randomUUID()
    if (!await redis.set(prefix + job.vodId + ":lock", lease, { nx: true, ex: 6 * 3600 })) continue
    const current = await read<TwitchVodJob>(redis, prefix + job.vodId)
    if (!current || !["pending", "rendering"].includes(current.status)) continue
    return save({ ...current, status: "rendering", lease }, redis)
  }
  return null
}
async function leasedJob(vodId: string, lease: string, options: Options) {
  const redis = db(options)
  const raw = await read<TwitchVodJob>(redis, prefix + vodId)
  if (!raw) throw new Error("TWITCH_VOD_NOT_FOUND")
  const job = jobSchema.parse(raw)
  if (job.lease !== lease || await redis.get(prefix + vodId + ":lock") !== lease) throw new Error("TWITCH_VOD_LEASE_INVALID")
  return { redis, job }
}
async function youtubeToken(options: Options, requireEdit = false) {
  const env = options.env ?? process.env
  const credential = await getStoredYouTubeOwnerCredential({ env, redis: options.redis as never })
  const client = resolveYouTubeOAuthClient(env)
  if (!credential || !client || credential.channelId !== SMOKYBANANA03_YOUTUBE_CHANNEL_ID) throw new Error("YOUTUBE_VOD_CONNECTION_REQUIRED")
  if (requireEdit && !credential.scopes.some(scope => [YOUTUBE_FORCE_SSL_SCOPE, "https://www.googleapis.com/auth/youtube"].includes(scope))) throw new Error("YOUTUBE_VOD_EDIT_SCOPE_REQUIRED")
  const fetcher = options.fetcher ?? fetch
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: client.clientId, client_secret: client.clientSecret,
      refresh_token: credential.refreshToken, grant_type: "refresh_token" }), signal: AbortSignal.timeout(20_000),
  })
  const body = await response.json() as { access_token?: string }
  if (!response.ok || !body.access_token) throw new Error("YOUTUBE_VOD_TOKEN_FAILED")
  const channel = await fetcher("https://www.googleapis.com/youtube/v3/channels?part=id&mine=true", {
    headers: { Authorization: `Bearer ${body.access_token}` }, signal: AbortSignal.timeout(20_000),
  })
  const channels = await channel.json() as { items?: Array<{ id: string }> }
  if (!channel.ok || !channels.items?.some(item => item.id === SMOKYBANANA03_YOUTUBE_CHANNEL_ID)) throw new Error("YOUTUBE_VOD_CHANNEL_MISMATCH")
  return body.access_token
}
export function validateYouTubeSessionUrl(value: string) {
  const url = new URL(value)
  if (url.protocol !== "https:" || url.hostname !== "www.googleapis.com" || url.username || url.password ||
    url.pathname !== "/upload/youtube/v3/videos" || !url.searchParams.get("upload_id")) throw new Error("YOUTUBE_VOD_SESSION_INVALID")
  return value
}
export async function beginTwitchVodUpload(input: { vodId: string; lease: string; bytes: number }, options: Options = {}) {
  if (!Number.isSafeInteger(input.bytes) || input.bytes <= 0 || input.bytes > 256 * 1024 ** 3) throw new Error("YOUTUBE_VOD_SIZE_INVALID")
  const { redis, job } = await leasedJob(input.vodId, input.lease, options)
  if (job.status !== "rendering") throw new Error("YOUTUBE_VOD_RECONCILIATION_REQUIRED")
  const token = await youtubeToken(options)
  // Persist an ambiguity fence before contacting YouTube. Never automatically start a second session.
  await save({ ...job, status: "uploading" }, redis)
  const response = await (options.fetcher ?? fetch)("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet%2Cstatus&notifySubscribers=false", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json",
      "X-Upload-Content-Length": String(input.bytes), "X-Upload-Content-Type": "video/mp4" },
    body: JSON.stringify({ snippet: { ...job.metadata, categoryId: "20", tags: ["SmokyBanana03", "Twitch VOD", "Gaming", "AMS"] },
      status: { privacyStatus: "private", embeddable: true, selfDeclaredMadeForKids: false } }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`YOUTUBE_VOD_INIT_HTTP_${response.status}`)
  const location = response.headers.get("location")
  if (!location) throw new Error("YOUTUBE_VOD_SESSION_MISSING")
  // Session URL is returned solely to the authenticated, repository-pinned media worker, never owner UI.
  return { uploadUrl: validateYouTubeSessionUrl(location) }
}
export async function completeTwitchVod(input: { vodId: string; lease: string; videoId?: string; errorCode?: string }, options: Options = {}) {
  const { redis, job } = await leasedJob(input.vodId, input.lease, options)
  if (input.errorCode) {
    return save({ ...job, status: job.status === "uploading" ? "reconciliation" : "failed",
      errorCode: input.errorCode.replace(/[^A-Z0-9_:]/g, "_").slice(0, 100) }, redis)
  }
  if (!input.videoId || !/^[A-Za-z0-9_-]{11}$/.test(input.videoId) || job.status !== "uploading") throw new Error("YOUTUBE_VOD_COMPLETION_INVALID")
  await save({ ...job, youtubeVideoId: input.videoId }, redis)
  const token = await youtubeToken(options)
  const response = await (options.fetcher ?? fetch)(`https://www.googleapis.com/youtube/v3/videos?part=snippet%2Cstatus&id=${input.videoId}`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000),
  })
  const body = await response.json() as { items?: Array<{ snippet: { channelId: string; title: string; description: string }; status: { privacyStatus: string } }> }
  const video = body.items?.[0]
  if (!response.ok || !video || video.snippet.channelId !== SMOKYBANANA03_YOUTUBE_CHANNEL_ID ||
    video.status.privacyStatus !== "private" || video.snippet.title !== job.metadata.title ||
    video.snippet.description !== job.metadata.description) throw new Error("YOUTUBE_VOD_PROOF_FAILED")
  const result = await save({ ...job, youtubeVideoId: input.videoId, status: "verified", errorCode: null }, redis)
  await redis.del(prefix + job.vodId + ":lock")
  return result
}

// Public promotion only changes the existing, privately verified upload. A timeout is
// reconciled by reading YouTube on the next cycle, never by uploading another copy.
export async function publishVerifiedTwitchVods(options: Options = {}) {
  if (!isYouTubePublicAutopublishEnabled(options.env ?? process.env)) return { skipped: "YOUTUBE_PUBLIC_AUTOPUBLISH_DISABLED", published: 0 }
  const redis = db(options)
  const lock = "ams:twitch-catchup:v1:publish-lock"
  if (!await redis.set(lock, "locked", { nx: true, ex: 600 })) return { skipped: "TWITCH_CATCHUP_BUSY", published: 0 }
  let published = 0
  try {
    const { jobs } = await getTwitchCatchupStatus({ ...options, redis })
    const pending = jobs.filter(job => job.status === "verified" && job.youtubeVideoId)
    if (!pending.length) return { published }
    const token = await youtubeToken({ ...options, redis }, true)
    const fetcher = options.fetcher ?? fetch
    for (const job of pending.slice(0, 3)) {
      try {
        const inspect = async () => {
          const response = await fetcher(`https://www.googleapis.com/youtube/v3/videos?part=snippet%2Cstatus%2CprocessingDetails&id=${job.youtubeVideoId}`, {
            headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000),
          })
          const body = await response.json() as { items?: Array<{ snippet: { channelId: string; title: string; description: string }; status: Record<string, unknown>; processingDetails?: { processingStatus?: string } }> }
          const video = body.items?.[0]
          if (!response.ok || !video || video.snippet.channelId !== SMOKYBANANA03_YOUTUBE_CHANNEL_ID ||
            video.snippet.title !== job.metadata.title || video.snippet.description !== job.metadata.description) throw new Error("YOUTUBE_VOD_PUBLIC_PROOF_FAILED")
          return video
        }
        let video = await inspect()
        if (video.status.privacyStatus !== "public") {
          if (video.status.privacyStatus !== "private") throw new Error("YOUTUBE_VOD_SOURCE_NOT_PRIVATE")
          if (video.processingDetails?.processingStatus !== "succeeded") {
            await save({ ...job, errorCode: "YOUTUBE_VOD_PROCESSING_PENDING" }, redis)
            continue
          }
          const status: Record<string, unknown> = { privacyStatus: "public" }
          for (const key of ["embeddable", "license", "publicStatsViewable", "selfDeclaredMadeForKids", "containsSyntheticMedia"]) {
            if (typeof video.status[key] === "boolean" || (key === "license" && typeof video.status[key] === "string")) status[key] = video.status[key]
          }
          const update = await fetcher("https://www.googleapis.com/youtube/v3/videos?part=status", {
            method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ id: job.youtubeVideoId, status }), signal: AbortSignal.timeout(20_000),
          })
          if (!update.ok) throw new Error(`YOUTUBE_VOD_PUBLIC_HTTP_${update.status}`)
          video = await inspect()
        }
        if (video.status.privacyStatus !== "public") throw new Error("YOUTUBE_VOD_PUBLIC_NOT_VERIFIED")
        await save({ ...job, status: "published", errorCode: null }, redis)
        published++
      } catch (error) {
        const code = error instanceof Error && /^YOUTUBE_[A-Z0-9_]+$/.test(error.message) ? error.message : "YOUTUBE_VOD_PUBLIC_RECONCILIATION_PENDING"
        await save({ ...job, errorCode: code }, redis)
      }
    }
    return { published }
  } finally { await redis.del(lock) }
}
