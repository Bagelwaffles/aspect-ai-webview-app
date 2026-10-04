import { randomUUID } from "node:crypto"
import { Redis } from "@upstash/redis"
import { z } from "zod"
import { getOwnedTwitchLiveStream, getTwitchPilotStatus, getTwitchRecentArchive, type TwitchRecentVod } from "./twitch-pilot"
import { runTwitchAutomaticPrivateShorts } from "./twitch-auto-factory"
import { getStoredYouTubeOwnerCredential, resolveYouTubeOAuthClient, SMOKYBANANA03_YOUTUBE_CHANNEL_ID, YOUTUBE_FORCE_SSL_SCOPE } from "./youtube-owner-connection"

import { isYouTubePublicAutopublishEnabled } from "./youtube-public-promoter"

const TTL = 180 * 24 * 3600
const INDEX = "ams:twitch-catchup:v1:index"
const PLAN = "ams:twitch-catchup:v1:plan"
const DISCOVERY = "ams:twitch-catchup:v1:discovery"
const WORKER = "ams:twitch-catchup:v1:worker"
const ACTIVE_JOB_STALL_MS = 7 * 3600_000
const SCHEDULE_STALL_MS = 3 * 3600_000
const prefix = "ams:twitch-catchup:v1:vod:"
const jobSchema = z.object({
  vodId: z.string().regex(/^\d+$/), streamer: z.literal("SmokyBanana03"), title: z.string(),
  createdAt: z.string().datetime(), durationSeconds: z.number().positive(),
  status: z.enum(["pending", "rendering", "uploading", "verified", "published", "blocked", "failed", "reconciliation"]),
  lease: z.string().nullable(), youtubeVideoId: z.string().nullable(), errorCode: z.string().nullable(),
  previousYoutubeVideoIds: z.array(z.string()).max(10).optional(),
  updatedAt: z.string().datetime().optional(),
  thumbnailStatus: z.enum(["pending", "uploaded", "failed"]).optional(),
  thumbnailUpdatedAt: z.string().datetime().optional(),
  thumbnailErrorCode: z.string().max(100).nullable().optional(),
  metadata: z.object({ title: z.string().max(100), description: z.string().max(5000) }),
}).strict()
export type TwitchVodJob = z.infer<typeof jobSchema>
type Store = Pick<Redis, "get" | "set" | "del">
type Options = { redis?: Store; env?: NodeJS.ProcessEnv; fetcher?: typeof fetch;
  getStatus?: typeof getTwitchPilotStatus; getArchive?: typeof getTwitchRecentArchive; getLiveStream?: typeof getOwnedTwitchLiveStream }
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
  const stored = jobSchema.parse({ ...job, updatedAt: new Date().toISOString() })
  await redis.set(prefix + job.vodId, JSON.stringify(stored), { ex: TTL })
  return stored
}
export function vodMetadata(vod: Pick<TwitchRecentVod, "id" | "title" | "createdAt">) {
  const date = vod.createdAt.slice(0, 10)
  return {
    title: `SmokyBanana03 | ${date} | Full Stream | ${vod.title}`.slice(0, 100),
    description: `Full Twitch stream from SmokyBanana03, recorded ${date}.\n\n${vod.title.slice(0, 1000)}\n\nStreamer: SmokyBanana03\nSource: https://www.twitch.tv/videos/${vod.id}\nFollow: https://www.twitch.tv/smokybanana03\n\nCreated by Aspect Marketing Solutions (AMS)\nhttps://www.aspectmarketingsolutions.app\n\nIncludes a 5-second introduction and a 7-second outro. Original stream footage is preserved.\n#SmokyBanana03 #TwitchVOD #Gaming`,
  }
}
type WorkerHealth = {
  lastStartedAt: string | null
  lastSucceededAt: string | null
  lastScheduledStartedAt: string | null
  lastScheduledSucceededAt: string | null
  lastTrigger: string | null
  lastErrorCode: string | null
}

export async function getTwitchCatchupStatus(options: Options = {}) {
  const redis = db(options)
  const ids = await read<string[]>(redis, INDEX) ?? []
  const storedJobs = (await Promise.all(ids.map(id => read<TwitchVodJob>(redis, prefix + id))))
    .filter((job): job is TwitchVodJob => Boolean(job))
  const now = Date.now()
  const jobs = storedJobs.map(job => {
    const staleForSeconds = job.updatedAt
      ? Math.max(0, Math.floor((now - Date.parse(job.updatedAt)) / 1000))
      : 0
    const stalled = Boolean(job.updatedAt) && ["rendering", "uploading", "reconciliation"].includes(job.status) &&
      staleForSeconds * 1000 > ACTIVE_JOB_STALL_MS
    return { ...job, stalled, staleForSeconds }
  })
  const worker = await read<WorkerHealth>(redis, WORKER)
  const scheduledAge = worker?.lastScheduledSucceededAt ? now - Date.parse(worker.lastScheduledSucceededAt) : null
  // No OAuth tokens or resumable upload session URLs are stored in or exposed by this status.
  return { discovery: await read<{ checkedAt: string; newlyQueued: number; completedVodCount: number }>(redis, DISCOVERY),
    plan: await read<{ clipVodIds: string[]; clipCursor: number; endedAt: string; startedAt: string; clipFailures?: string[] }>(redis, PLAN),
    monitoring: {
      worker,
      scheduledStale: scheduledAge === null || scheduledAge > SCHEDULE_STALL_MS,
      stalledVodIds: jobs.filter(job => job.stalled).map(job => job.vodId),
    },
    jobs }
}

export async function recordTwitchCatchupWorker(input: {
  phase: "started" | "succeeded" | "failed"
  trigger: string
  errorCode?: string
}, options: Options = {}) {
  const redis = db(options)
  const now = new Date().toISOString()
  const current = await read<WorkerHealth>(redis, WORKER) ?? {
    lastStartedAt: null, lastSucceededAt: null, lastScheduledStartedAt: null,
    lastScheduledSucceededAt: null, lastTrigger: null, lastErrorCode: null,
  }
  const scheduled = input.trigger === "schedule"
  const next: WorkerHealth = {
    ...current,
    lastTrigger: input.trigger.slice(0, 40),
    lastErrorCode: input.phase === "failed" ? (input.errorCode ?? "TWITCH_CATCHUP_WORKER_FAILED").slice(0, 100) : null,
    ...(input.phase === "started" ? {
      lastStartedAt: now,
      ...(scheduled ? { lastScheduledStartedAt: now } : {}),
    } : {}),
    ...(input.phase === "succeeded" ? {
      lastSucceededAt: now,
      ...(scheduled ? { lastScheduledSucceededAt: now } : {}),
    } : {}),
  }
  await redis.set(WORKER, JSON.stringify(next), { ex: TTL })
  return next
}
export async function startTwitchCatchup(options: Options = {}, includeClipPlan = true) {
  const redis = db(options)
  const lock = "ams:twitch-catchup:v1:start-lock"
  if (!await redis.set(lock, "locked", { nx: true, ex: 120 })) throw new Error("TWITCH_CATCHUP_BUSY")
  try {
    const status = await (options.getStatus ?? getTwitchPilotStatus)({ ...options, redis: redis as never })
    if (!status.connected || status.connection?.login.toLowerCase() !== "smokybanana03") throw new Error("TWITCH_CATCHUP_CHANNEL_MISMATCH")
    const live = await (options.getLiveStream ?? getOwnedTwitchLiveStream)({ ...options, redis: redis as never })
    const archive = await (options.getArchive ?? getTwitchRecentArchive)(31 * 24, { ...options, redis: redis as never }, undefined, includeClipPlan)
    const monthStart = new Date(archive.endedAt)
    monthStart.setUTCMonth(monthStart.getUTCMonth() - 1)
    const vods = archive.vods.filter(vod => Date.parse(vod.createdAt) >= monthStart.getTime() &&
      (!live || vod.streamId !== live.streamId && Date.parse(vod.createdAt) < Date.parse(live.startedAt)))
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    const existingIds = await read<string[]>(redis, INDEX) ?? []
    let newlyQueued = 0
    for (const vod of vods) {
      if (!/^\d+$/.test(vod.id) || !vod.durationSeconds) continue
      if (await read(redis, prefix + vod.id)) continue
      await save({ vodId: vod.id, streamer: "SmokyBanana03", title: vod.title, createdAt: vod.createdAt,
        durationSeconds: vod.durationSeconds, status: "pending", lease: null, youtubeVideoId: null,
        errorCode: null, thumbnailStatus: "pending", thumbnailErrorCode: null, metadata: vodMetadata(vod) }, redis)
      newlyQueued++
    }
    await redis.set(INDEX, JSON.stringify([...new Set([...existingIds, ...vods.map(vod => vod.id)])]), { ex: TTL })
    await redis.set(DISCOVERY, JSON.stringify({ checkedAt: new Date().toISOString(), newlyQueued, completedVodCount: vods.length }), { ex: TTL })
    const clipStart = new Date(Date.parse(archive.endedAt) - 14 * 24 * 3600_000).toISOString()
    const previous = await read<{ clipCursor: number; clipVodIds: string[] }>(redis, PLAN)
    if (includeClipPlan && (!previous || previous.clipCursor >= previous.clipVodIds.length)) {
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
  let longUploadsAllowed: boolean | undefined
  for (const job of [...jobs].sort((a, b) => a.durationSeconds - b.durationSeconds)) {
    const safeRetry = job.status === "failed" && job.errorCode === "YOUTUBE_CONNECTION_VAULT_UNAVAILABLE" && !job.youtubeVideoId
    if (!["pending", "rendering", "blocked"].includes(job.status) && !safeRetry) continue
    // This failure occurs before a resumable upload session is created. Never retry uploading/reconciliation jobs.
    if (safeRetry && job.lease && await redis.get(prefix + job.vodId + ":lock") === job.lease) await redis.del(prefix + job.vodId + ":lock")
    if (job.durationSeconds + 12 > 900) {
      if (longUploadsAllowed === undefined) {
        try { await youtubeToken({ ...options, redis }, false, true); longUploadsAllowed = true }
        catch (error) {
          if (!(error instanceof Error) || error.message !== "YOUTUBE_LONG_UPLOAD_VERIFICATION_REQUIRED") throw error
          longUploadsAllowed = false
        }
      }
      if (!longUploadsAllowed) {
        // Do not clear an active renderer's lock. It will also check eligibility
        // before uploading; a cancelled renderer can resume after its lease expires.
        if (job.status === "rendering") continue
        await save({ ...job, status: "blocked", errorCode: "YOUTUBE_LONG_UPLOAD_VERIFICATION_REQUIRED" }, redis)
        continue
      }
    }
    const lease = randomUUID()
    if (!await redis.set(prefix + job.vodId + ":lock", lease, { nx: true, ex: 6 * 3600 })) continue
    const current = await read<TwitchVodJob>(redis, prefix + job.vodId)
    if (!current || !["pending", "rendering", "blocked"].includes(current.status) && !(current.status === "failed" && current.errorCode === "YOUTUBE_CONNECTION_VAULT_UNAVAILABLE" && !current.youtubeVideoId)) continue
    return save({ ...current, status: "rendering", lease, errorCode: null }, redis)
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
async function youtubeToken(options: Options, requireEdit = false, requireLongUploads = false) {
  const env = options.env ?? process.env
  const credential = await getStoredYouTubeOwnerCredential({ env, redis: db(options) as never })
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
  const channel = await fetcher("https://www.googleapis.com/youtube/v3/channels?part=id%2Cstatus&mine=true", {
    headers: { Authorization: `Bearer ${body.access_token}` }, signal: AbortSignal.timeout(20_000),
  })
  const channels = await channel.json() as { items?: Array<{ id: string; status?: { longUploadsStatus?: string } }> }
  if (!channel.ok || !channels.items?.some(item => item.id === SMOKYBANANA03_YOUTUBE_CHANNEL_ID)) throw new Error("YOUTUBE_VOD_CHANNEL_MISMATCH")
  if (requireLongUploads && channels.items?.find(item => item.id === SMOKYBANANA03_YOUTUBE_CHANNEL_ID)?.status?.longUploadsStatus !== "allowed") throw new Error("YOUTUBE_LONG_UPLOAD_VERIFICATION_REQUIRED")
  return body.access_token
}
export async function setTwitchVodThumbnail(input: {
  vodId: string
  lease: string
  videoId: string
  jpegBase64: string
}, options: Options = {}) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(input.videoId)) throw new Error("YOUTUBE_VOD_THUMBNAIL_VIDEO_INVALID")
  const { redis, job } = await leasedJob(input.vodId, input.lease, options)
  if (job.status !== "uploading") throw new Error("YOUTUBE_VOD_RECONCILIATION_REQUIRED")
  let jpeg: Buffer
  try { jpeg = Buffer.from(input.jpegBase64, "base64") } catch { throw new Error("YOUTUBE_VOD_THUMBNAIL_INVALID") }
  if (jpeg.length < 1024 || jpeg.length > 2 * 1024 * 1024 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
    throw new Error("YOUTUBE_VOD_THUMBNAIL_INVALID")
  }
  try {
    const token = await youtubeToken({ ...options, redis })
    const response = await (options.fetcher ?? fetch)(
      `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(input.videoId)}&uploadType=media`,
      { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" },
        body: new Uint8Array(jpeg), signal: AbortSignal.timeout(30_000) },
    )
    if (!response.ok) throw new Error(`YOUTUBE_VOD_THUMBNAIL_HTTP_${response.status}`)
    await save({ ...job, thumbnailStatus: "uploaded", thumbnailUpdatedAt: new Date().toISOString(),
      thumbnailErrorCode: null }, redis)
    return { status: "uploaded" as const }
  } catch (error) {
    const code = error instanceof Error && /^YOUTUBE_[A-Z0-9_]+$/.test(error.message)
      ? error.message : "YOUTUBE_VOD_THUMBNAIL_FAILED"
    await save({ ...job, thumbnailStatus: "failed", thumbnailUpdatedAt: new Date().toISOString(),
      thumbnailErrorCode: code }, redis)
    return { status: "failed" as const, code }
  }
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
  const token = await youtubeToken(options, false, job.durationSeconds + 12 > 900)
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
    if (job.status !== "uploading" && input.errorCode === "YOUTUBE_LONG_UPLOAD_VERIFICATION_REQUIRED") {
      const result = await save({ ...job, status: "blocked", lease: null, errorCode: input.errorCode }, redis)
      await redis.del(prefix + job.vodId + ":lock")
      return result
    }
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
          if (response.ok && !video) throw new Error("YOUTUBE_VOD_REMOVED_OR_UNAVAILABLE")
          if (!response.ok || !video || video.snippet.channelId !== SMOKYBANANA03_YOUTUBE_CHANNEL_ID ||
            video.snippet.title !== job.metadata.title || video.snippet.description !== job.metadata.description) throw new Error("YOUTUBE_VOD_PUBLIC_PROOF_FAILED")
          return video
        }
        let video = await inspect()
        if (video.status.privacyStatus !== "public") {
          if (video.status.privacyStatus !== "private") throw new Error("YOUTUBE_VOD_SOURCE_NOT_PRIVATE")
          if (video.processingDetails?.processingStatus !== "succeeded" && video.status.uploadStatus !== "processed") {
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
        await save({ ...job, status: code === "YOUTUBE_VOD_REMOVED_OR_UNAVAILABLE" ? "reconciliation" : job.status, errorCode: code }, redis)
      }
    }
    return { published }
  } finally { await redis.del(lock) }
}

// An owner-confirmed removed/rejected upload can be replaced. A missing video alone
// never automatically clears the duplicate-upload fence.
export async function retryRemovedTwitchVod(input: { vodId: string; videoId: string; approved: boolean }, options: Options = {}) {
  if (!input.approved) throw new Error("TWITCH_CATCHUP_APPROVAL_REQUIRED")
  const redis = db(options)
  const raw = await read<TwitchVodJob>(redis, prefix + input.vodId)
  if (!raw || raw.youtubeVideoId !== input.videoId || !["verified", "reconciliation"].includes(raw.status) ||
    !["YOUTUBE_VOD_PUBLIC_PROOF_FAILED", "YOUTUBE_VOD_REMOVED_OR_UNAVAILABLE"].includes(raw.errorCode ?? "")) throw new Error("YOUTUBE_VOD_RETRY_NOT_ALLOWED")
  const token = await youtubeToken({ ...options, redis })
  const response = await (options.fetcher ?? fetch)(`https://www.googleapis.com/youtube/v3/videos?part=status&id=${input.videoId}`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000),
  })
  const body = await response.json() as { items?: Array<{ status?: { uploadStatus?: string; rejectionReason?: string } }> }
  if (!response.ok || !Array.isArray(body.items)) throw new Error("YOUTUBE_VOD_REMOVAL_NOT_VERIFIED")
  const video = body.items[0]
  if (video && !(video.status?.uploadStatus === "rejected" && video.status.rejectionReason === "length")) throw new Error("YOUTUBE_VOD_RETRY_EXISTING_VIDEO")
  await save({ ...raw, status: "pending", lease: null, youtubeVideoId: null, errorCode: null,
    previousYoutubeVideoIds: [...(raw.previousYoutubeVideoIds ?? []), input.videoId].slice(-10) }, redis)
  return getTwitchCatchupStatus({ ...options, redis })
}

export async function retryCancelledTwitchVod(input: { vodId: string; approved: boolean }, options: Options = {}) {
  if (!input.approved) throw new Error("TWITCH_CATCHUP_APPROVAL_REQUIRED")
  const redis = db(options)
  const job = await read<TwitchVodJob>(redis, prefix + input.vodId)
  // The owner must first confirm that the renderer was stopped. Uploading or
  // ambiguous sessions remain fenced and are never reset by this operation.
  if (!job || job.status !== "rendering" || job.youtubeVideoId) throw new Error("YOUTUBE_VOD_CANCELLED_RETRY_NOT_ALLOWED")
  await save({ ...job, status: "pending", lease: null, errorCode: null }, redis)
  await redis.del(prefix + job.vodId + ":lock")
  return getTwitchCatchupStatus({ ...options, redis })
}
