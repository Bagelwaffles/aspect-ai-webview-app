import { Redis } from "@upstash/redis"
import { z } from "zod"

import {
  getTwitchShortRenderJob,
  type TwitchShortRenderJob,
} from "@/lib/server/twitch-short-render-jobs"
import {
  getYouTubePrivateUploadRecord,
  getYouTubePrivateVerificationProof,
} from "@/lib/server/youtube-private-uploader"
import {
  getStoredYouTubeOwnerCredential,
  resolveYouTubeOAuthClient,
  SMOKYBANANA03_YOUTUBE_CHANNEL_ID,
  YOUTUBE_FORCE_SSL_SCOPE,
} from "@/lib/server/youtube-owner-connection"

export const YOUTUBE_PUBLIC_PROMOTION_VERSION = "youtube-public-promotion-v1" as const
export const YOUTUBE_PUBLIC_MAX_PER_STREAM = 3

const YOUTUBE_PUBLIC_TTL_SECONDS = 60 * 60 * 24 * 180
const YOUTUBE_PUBLIC_KEY_PREFIX = "ams:youtube-public-promotion:v1:job:"
const YOUTUBE_PUBLIC_STREAM_PREFIX = "ams:youtube-public-promotion:v1:stream:"
const YOUTUBE_MANAGE_SCOPE = "https://www.googleapis.com/auth/youtube"

export const youtubePublicPromotionRecordSchema = z.object({
  version: z.literal(YOUTUBE_PUBLIC_PROMOTION_VERSION),
  renderJobId: z.string().min(1).max(200),
  clipId: z.string().min(1).max(160),
  sourceVideoId: z.string().min(1).max(160),
  selectionRank: z.number().int().min(1).max(3),
  youtubeVideoId: z.string().min(1).max(80),
  channelId: z.string().min(1).max(120),
  status: z.enum(["pending", "promoting", "succeeded", "failed", "reconciliation"]),
  attempts: z.number().int().min(0).max(10),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  errorCode: z.string().max(200).nullable(),
}).strict()

export type YouTubePublicPromotionRecord = z.infer<typeof youtubePublicPromotionRecordSchema>

type RedisLike = Pick<Redis, "get" | "set">

type Options = {
  env?: NodeJS.ProcessEnv
  redis?: RedisLike | null
  fetcher?: typeof fetch
  now?: () => Date
  getRenderJob?: (jobId: string) => Promise<TwitchShortRenderJob | null>
}

function clean(value: string | undefined) {
  const result = value?.trim()
  return result || null
}

function resolveRedis(env: NodeJS.ProcessEnv): RedisLike | null {
  const url = clean(env.UPSTASH_REDIS_REST_URL) ?? clean(env.KV_REST_API_URL)
  const token = clean(env.UPSTASH_REDIS_REST_TOKEN) ?? clean(env.KV_REST_API_TOKEN)
  return url && token ? new Redis({ url, token }) : null
}

function runtimeRedis(options: Options) {
  if (Object.prototype.hasOwnProperty.call(options, "redis")) return options.redis ?? null
  return resolveRedis(options.env ?? process.env)
}

function nowIso(options: Options) {
  return (options.now ?? (() => new Date()))().toISOString()
}

function promotionKey(renderJobId: string) {
  return `${YOUTUBE_PUBLIC_KEY_PREFIX}${renderJobId}`
}

function streamKey(sourceVideoId: string) {
  return `${YOUTUBE_PUBLIC_STREAM_PREFIX}${sourceVideoId}`
}

function parseRecord(raw: unknown): YouTubePublicPromotionRecord | null {
  if (!raw) return null
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw
    const parsed = youtubePublicPromotionRecordSchema.safeParse(value)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

async function saveRecord(record: YouTubePublicPromotionRecord, redis: RedisLike) {
  const parsed = youtubePublicPromotionRecordSchema.parse(record)
  await redis.set(promotionKey(parsed.renderJobId), JSON.stringify(parsed), {
    ex: YOUTUBE_PUBLIC_TTL_SECONDS,
  })
  return parsed
}

async function loadStreamPromotions(sourceVideoId: string, redis: RedisLike) {
  const raw = await redis.get<unknown>(streamKey(sourceVideoId))
  if (!raw) return [] as Array<{ renderJobId: string; youtubeVideoId: string }>
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw
    if (!Array.isArray(value)) return []
    return value
      .map((item) => {
        if (!item || typeof item !== "object") return null
        const record = item as Record<string, unknown>
        const renderJobId = typeof record.renderJobId === "string" ? record.renderJobId : ""
        const youtubeVideoId = typeof record.youtubeVideoId === "string" ? record.youtubeVideoId : ""
        return renderJobId && youtubeVideoId ? { renderJobId, youtubeVideoId } : null
      })
      .filter((item): item is { renderJobId: string; youtubeVideoId: string } => Boolean(item))
      .slice(0, YOUTUBE_PUBLIC_MAX_PER_STREAM)
  } catch {
    return []
  }
}

async function saveStreamPromotions(
  sourceVideoId: string,
  entries: Array<{ renderJobId: string; youtubeVideoId: string }>,
  redis: RedisLike,
) {
  const unique = entries.filter((entry, index, all) =>
    all.findIndex((item) => item.renderJobId === entry.renderJobId) === index,
  ).slice(0, YOUTUBE_PUBLIC_MAX_PER_STREAM)
  await redis.set(streamKey(sourceVideoId), JSON.stringify(unique), {
    ex: YOUTUBE_PUBLIC_TTL_SECONDS,
  })
}

export function isYouTubePublicAutopublishEnabled(env: NodeJS.ProcessEnv = process.env) {
  return clean(env.AMS_TWITCH_YOUTUBE_PUBLIC_AUTOPUBLISH)?.toLowerCase() === "true"
}

export async function getYouTubePublicPromotionRecord(
  renderJobId: string,
  options: Options = {},
) {
  const redis = runtimeRedis(options)
  if (!redis) return null
  return parseRecord(await redis.get<unknown>(promotionKey(renderJobId)))
}

async function accessToken(options: Options, redis: RedisLike) {
  const env = options.env ?? process.env
  const stored = await getStoredYouTubeOwnerCredential({
    env,
    redis: redis as never,
  })
  const client = resolveYouTubeOAuthClient(env)
  if (!stored || !client) throw new Error("YOUTUBE_PUBLIC_OWNER_CONNECTION_REQUIRED")

  const allowed =
    stored.scopes.includes(YOUTUBE_FORCE_SSL_SCOPE) ||
    stored.scopes.includes(YOUTUBE_MANAGE_SCOPE)
  if (!allowed) throw new Error("YOUTUBE_PUBLIC_EDIT_SCOPE_REQUIRED")

  const response = await (options.fetcher ?? fetch)("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: stored.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  })
  const json = (await response.json().catch(() => null)) as { access_token?: unknown } | null
  if (!response.ok) throw new Error(`YOUTUBE_OAUTH_HTTP_${response.status}`)
  const token = typeof json?.access_token === "string" ? json.access_token.trim() : ""
  if (!token) throw new Error("YOUTUBE_OAUTH_ACCESS_TOKEN_MISSING")
  return { token, channelId: stored.channelId }
}

function mutableStatus(status: Record<string, unknown>) {
  const next: Record<string, unknown> = { privacyStatus: "public" }
  for (const key of [
    "embeddable",
    "license",
    "publicStatsViewable",
    "selfDeclaredMadeForKids",
    "containsSyntheticMedia",
  ] as const) {
    const value = status[key]
    if (
      typeof value === "boolean" ||
      (key === "license" && typeof value === "string" && value)
    ) {
      next[key] = value
    }
  }
  return next
}

async function readVideo(
  videoId: string,
  token: string,
  fetcher: typeof fetch,
) {
  const response = await fetcher(
    `https://www.googleapis.com/youtube/v3/videos?part=id%2Csnippet%2Cstatus&id=${encodeURIComponent(videoId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  )
  if (!response.ok) throw new Error(`YOUTUBE_PUBLIC_VERIFY_HTTP_${response.status}`)
  const payload = await response.json().catch(() => null) as {
    items?: Array<{
      id?: unknown
      snippet?: { channelId?: unknown }
      status?: Record<string, unknown>
    }>
  } | null
  const item = payload?.items?.find((candidate) => candidate.id === videoId)
  const channelId = typeof item?.snippet?.channelId === "string" ? item.snippet.channelId.trim() : ""
  const status = item?.status && typeof item.status === "object" ? item.status : {}
  const privacyStatus = typeof status.privacyStatus === "string" ? status.privacyStatus : ""
  if (!item || !channelId || !privacyStatus) throw new Error("YOUTUBE_PUBLIC_VIDEO_NOT_FOUND")
  return { channelId, privacyStatus, status }
}

async function markFailure(
  record: YouTubePublicPromotionRecord,
  code: string,
  redis: RedisLike,
  options: Options,
  ambiguous = false,
) {
  return saveRecord({
    ...record,
    status: ambiguous ? "reconciliation" : "failed",
    updatedAt: nowIso(options),
    completedAt: ambiguous ? null : nowIso(options),
    errorCode: code.slice(0, 200),
  }, redis)
}

export async function promoteRenderedTwitchShortPublic(
  input: { renderJobId: string; approved: boolean },
  options: Options = {},
) {
  if (!input.approved) throw new Error("YOUTUBE_PUBLIC_PROMOTION_APPROVAL_REQUIRED")
  const env = options.env ?? process.env
  if (!isYouTubePublicAutopublishEnabled(env)) {
    throw new Error("YOUTUBE_PUBLIC_AUTOPUBLISH_DISABLED")
  }

  const redis = runtimeRedis(options)
  if (!redis) throw new Error("YOUTUBE_PUBLIC_STORE_UNAVAILABLE")

  const existing = await getYouTubePublicPromotionRecord(input.renderJobId, {
    ...options,
    redis,
  })
  if (existing?.status === "succeeded") return { record: existing, reused: true }
  if (existing?.status === "promoting" || existing?.status === "reconciliation") {
    throw new Error("YOUTUBE_PUBLIC_RECONCILIATION_REQUIRED")
  }

  const job = await (options.getRenderJob ?? ((jobId) => getTwitchShortRenderJob(jobId)))(
    input.renderJobId,
  )
  if (!job || job.status !== "rendered" || !job.autoPublish) {
    throw new Error("YOUTUBE_PUBLIC_AUTO_SELECTION_REQUIRED")
  }

  const privateUpload = await getYouTubePrivateUploadRecord(input.renderJobId, {
    env,
    redis: redis as never,
  })
  const proof = await getYouTubePrivateVerificationProof(input.renderJobId, {
    env,
    redis: redis as never,
  })
  if (
    privateUpload?.status !== "succeeded" ||
    !privateUpload.youtubeVideoId ||
    privateUpload.channelId !== SMOKYBANANA03_YOUTUBE_CHANNEL_ID ||
    proof?.videoId !== privateUpload.youtubeVideoId ||
    proof.channelId !== SMOKYBANANA03_YOUTUBE_CHANNEL_ID ||
    proof.metadataVerified !== true
  ) {
    throw new Error("YOUTUBE_PUBLIC_PRIVATE_VERIFICATION_REQUIRED")
  }

  const streamPromotions = await loadStreamPromotions(job.autoPublish.sourceVideoId, redis)
  if (
    streamPromotions.length >= YOUTUBE_PUBLIC_MAX_PER_STREAM &&
    !streamPromotions.some((item) => item.renderJobId === job.jobId)
  ) {
    throw new Error("YOUTUBE_PUBLIC_STREAM_CAP_REACHED")
  }

  const fetcher = options.fetcher ?? fetch
  const auth = await accessToken({ ...options, env }, redis)
  if (auth.channelId !== SMOKYBANANA03_YOUTUBE_CHANNEL_ID) {
    throw new Error("YOUTUBE_CHANNEL_MISMATCH")
  }

  const timestamp = nowIso(options)
  let record = await saveRecord({
    version: YOUTUBE_PUBLIC_PROMOTION_VERSION,
    renderJobId: job.jobId,
    clipId: job.clipId,
    sourceVideoId: job.autoPublish.sourceVideoId,
    selectionRank: job.autoPublish.rank,
    youtubeVideoId: privateUpload.youtubeVideoId,
    channelId: privateUpload.channelId,
    status: "pending",
    attempts: (existing?.attempts ?? 0) + 1,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    completedAt: null,
    errorCode: null,
  }, redis)

  try {
    const before = await readVideo(record.youtubeVideoId, auth.token, fetcher)
    if (before.channelId !== SMOKYBANANA03_YOUTUBE_CHANNEL_ID) {
      throw new Error("YOUTUBE_CHANNEL_MISMATCH")
    }

    if (before.privacyStatus === "public") {
      const succeeded = await saveRecord({
        ...record,
        status: "succeeded",
        updatedAt: nowIso(options),
        completedAt: nowIso(options),
        errorCode: null,
      }, redis)
      await saveStreamPromotions(
        job.autoPublish.sourceVideoId,
        [...streamPromotions, {
          renderJobId: job.jobId,
          youtubeVideoId: record.youtubeVideoId,
        }],
        redis,
      )
      return { record: succeeded, reused: true }
    }
    if (before.privacyStatus !== "private") {
      throw new Error("YOUTUBE_PUBLIC_SOURCE_NOT_PRIVATE")
    }

    record = await saveRecord({
      ...record,
      status: "promoting",
      updatedAt: nowIso(options),
    }, redis)

    let update: Response
    try {
      update = await fetcher(
        "https://www.googleapis.com/youtube/v3/videos?part=status",
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${auth.token}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
          body: JSON.stringify({
            id: record.youtubeVideoId,
            status: mutableStatus(before.status),
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(20_000),
        },
      )
    } catch {
      return {
        record: await markFailure(
          record,
          "YOUTUBE_PUBLIC_UPDATE_AMBIGUOUS",
          redis,
          options,
          true,
        ),
        reused: false,
      }
    }

    if (!update.ok) {
      return {
        record: await markFailure(
          record,
          `YOUTUBE_PUBLIC_UPDATE_HTTP_${update.status}`,
          redis,
          options,
        ),
        reused: false,
      }
    }

    const after = await readVideo(record.youtubeVideoId, auth.token, fetcher)
    if (
      after.channelId !== SMOKYBANANA03_YOUTUBE_CHANNEL_ID ||
      after.privacyStatus !== "public"
    ) {
      return {
        record: await markFailure(
          record,
          "YOUTUBE_PUBLIC_VERIFICATION_MISMATCH",
          redis,
          options,
          true,
        ),
        reused: false,
      }
    }

    const succeeded = await saveRecord({
      ...record,
      status: "succeeded",
      updatedAt: nowIso(options),
      completedAt: nowIso(options),
      errorCode: null,
    }, redis)
    await saveStreamPromotions(
      job.autoPublish.sourceVideoId,
      [...streamPromotions, {
        renderJobId: job.jobId,
        youtubeVideoId: record.youtubeVideoId,
      }],
      redis,
    )
    return { record: succeeded, reused: false }
  } catch (error) {
    const code = error instanceof Error ? error.message : "YOUTUBE_PUBLIC_PROMOTION_FAILED"
    return {
      record: await markFailure(record, code, redis, options),
      reused: false,
    }
  }
}
