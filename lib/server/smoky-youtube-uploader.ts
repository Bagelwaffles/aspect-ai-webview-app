import { randomUUID } from "node:crypto"

import { Redis } from "@upstash/redis"
import { z } from "zod"

import { presignR2Object } from "@/lib/server/r2-presign"
import type { TwitchShortRenderJob } from "@/lib/server/twitch-short-render-jobs"

const SMOKY_TWITCH_BROADCASTER_ID = "155477801"
const UPLOAD_PREFIX = "ams:smoky-youtube:v1"
const UPLOAD_TTL_SECONDS = 60 * 60 * 24 * 180
const UPLOAD_LOCK_SECONDS = 15 * 60
const MAX_SHORT_BYTES = 128 * 1024 * 1024
const DEFAULT_CATEGORY_ID = "20"

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
})

const channelSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    snippet: z.object({
      title: z.string().optional(),
    }).optional(),
  })).default([]),
})

const uploadResponseSchema = z.object({
  id: z.string().min(1),
})

const uploadRecordSchema = z.object({
  version: z.literal("smoky-youtube-upload-v1"),
  jobId: z.string().min(1),
  status: z.enum(["uploading", "uploaded", "failed", "uncertain"]),
  expectedChannelId: z.string().min(1),
  verifiedChannelTitle: z.string().nullable(),
  youtubeVideoId: z.string().nullable(),
  privacyStatus: z.literal("private"),
  notifySubscribers: z.literal(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  errorCode: z.string().nullable(),
})

export type SmokyYouTubeUploadRecord = z.infer<typeof uploadRecordSchema>

type Dependencies = {
  env?: NodeJS.ProcessEnv
  redis?: Redis | null
  fetch?: typeof fetch
  now?: () => Date
}

function clean(value: string | undefined) {
  const result = value?.trim()
  return result || null
}

function resolveRedis(env: NodeJS.ProcessEnv): Redis | null {
  const url = clean(env.UPSTASH_REDIS_REST_URL) ?? clean(env.KV_REST_API_URL)
  const token = clean(env.UPSTASH_REDIS_REST_TOKEN) ?? clean(env.KV_REST_API_TOKEN)
  return url && token ? new Redis({ url, token }) : null
}

function runtimeRedis(dependencies: Dependencies) {
  if (Object.prototype.hasOwnProperty.call(dependencies, "redis")) return dependencies.redis ?? null
  return resolveRedis(dependencies.env ?? process.env)
}

function nowIso(dependencies: Dependencies) {
  return (dependencies.now ?? (() => new Date()))().toISOString()
}

function isRealSecret(value: string | null, min = 16) {
  if (!value || value.length < min) return false
  return !/(?:replace|placeholder|changeme|your)[-_ ]/iu.test(value)
}

function isYouTubeChannelId(value: string | null) {
  return Boolean(value && /^UC[A-Za-z0-9_-]{22}$/u.test(value))
}

export function getSmokyYouTubeConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const enabled = clean(env.AMS_SMOKY_YOUTUBE_AUTO_UPLOAD_ENABLED)?.toLowerCase() === "true"
  const clientId = clean(env.AMS_SMOKY_YOUTUBE_CLIENT_ID)
  const clientSecret = clean(env.AMS_SMOKY_YOUTUBE_CLIENT_SECRET)
  const refreshToken = clean(env.AMS_SMOKY_YOUTUBE_REFRESH_TOKEN)
  const expectedChannelId = clean(env.AMS_SMOKY_YOUTUBE_EXPECTED_CHANNEL_ID)

  return {
    enabled,
    expectedChannelId,
    configured:
      enabled &&
      isRealSecret(clientId) &&
      isRealSecret(clientSecret) &&
      isRealSecret(refreshToken) &&
      isYouTubeChannelId(expectedChannelId),
    clientId,
    clientSecret,
    refreshToken,
  }
}

async function safeJson(response: Response) {
  return await response.json().catch(() => null)
}

async function refreshAccessToken(
  config: ReturnType<typeof getSmokyYouTubeConfiguration>,
  fetcher: typeof fetch,
) {
  if (!config.configured || !config.clientId || !config.clientSecret || !config.refreshToken) {
    throw new Error("SMOKY_YOUTUBE_NOT_CONFIGURED")
  }

  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(`SMOKY_YOUTUBE_TOKEN_HTTP_${response.status}`)

  const parsed = tokenSchema.safeParse(await safeJson(response))
  if (!parsed.success) throw new Error("SMOKY_YOUTUBE_TOKEN_INVALID")
  return parsed.data.access_token
}

export async function verifySmokyYouTubeChannel(
  accessToken: string,
  expectedChannelId: string,
  fetcher: typeof fetch = fetch,
) {
  const url = new URL("https://www.googleapis.com/youtube/v3/channels")
  url.searchParams.set("part", "id,snippet")
  url.searchParams.set("mine", "true")

  const response = await fetcher(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(`SMOKY_YOUTUBE_CHANNEL_HTTP_${response.status}`)

  const parsed = channelSchema.safeParse(await safeJson(response))
  if (!parsed.success) throw new Error("SMOKY_YOUTUBE_CHANNEL_RESPONSE_INVALID")

  const channel = parsed.data.items.find((item) => item.id === expectedChannelId)
  if (!channel) throw new Error("SMOKY_YOUTUBE_CHANNEL_MISMATCH")

  return {
    id: channel.id,
    title: channel.snippet?.title?.trim() || null,
  }
}

function descriptionWithHashtags(description: string, hashtags: string[]) {
  const cleanTags = hashtags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag.replace(/\s+/gu, "")}`))
  const suffix = cleanTags.length ? `\n\n${cleanTags.join(" ")}` : ""
  return `${description.trim()}${suffix}`.slice(0, 5_000)
}

export async function uploadPrivateVideoToLockedSmokyChannel(
  input: {
    sourceUrl: string
    title: string
    description: string
    tags: string[]
    hashtags?: string[]
    categoryId?: string
  },
  dependencies: Dependencies = {},
) {
  const env = dependencies.env ?? process.env
  const fetcher = dependencies.fetch ?? fetch
  const config = getSmokyYouTubeConfiguration(env)
  if (!config.configured || !config.expectedChannelId) {
    throw new Error("SMOKY_YOUTUBE_NOT_CONFIGURED")
  }

  const accessToken = await refreshAccessToken(config, fetcher)
  const channel = await verifySmokyYouTubeChannel(
    accessToken,
    config.expectedChannelId,
    fetcher,
  )

  let mediaResponse: Response
  try {
    mediaResponse = await fetcher(input.sourceUrl, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    })
  } catch {
    throw new Error("SMOKY_YOUTUBE_SOURCE_FETCH_FAILED")
  }
  if (!mediaResponse.ok) {
    throw new Error(`SMOKY_YOUTUBE_SOURCE_HTTP_${mediaResponse.status}`)
  }

  const contentType = mediaResponse.headers.get("content-type")?.split(";")[0]?.trim() || "video/mp4"
  if (!contentType.startsWith("video/") && contentType !== "application/octet-stream") {
    throw new Error("SMOKY_YOUTUBE_SOURCE_TYPE_INVALID")
  }

  const sourceBuffer = await mediaResponse.arrayBuffer()
  if (!sourceBuffer.byteLength || sourceBuffer.byteLength > MAX_SHORT_BYTES) {
    throw new Error("SMOKY_YOUTUBE_SOURCE_SIZE_INVALID")
  }

  const uploadUrl = new URL("https://www.googleapis.com/upload/youtube/v3/videos")
  uploadUrl.searchParams.set("uploadType", "resumable")
  uploadUrl.searchParams.set("part", "snippet,status")
  uploadUrl.searchParams.set("notifySubscribers", "false")

  const metadata = {
    snippet: {
      title: input.title.trim().slice(0, 100),
      description: descriptionWithHashtags(input.description, input.hashtags ?? []),
      tags: [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 20),
      categoryId: input.categoryId ?? DEFAULT_CATEGORY_ID,
    },
    status: {
      privacyStatus: "private",
    },
  }

  const initiate = await fetcher(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(sourceBuffer.byteLength),
      "X-Upload-Content-Type": contentType,
    },
    body: JSON.stringify(metadata),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  })
  if (!initiate.ok) throw new Error(`SMOKY_YOUTUBE_INIT_HTTP_${initiate.status}`)

  const resumableUrl = initiate.headers.get("location")?.trim()
  if (!resumableUrl?.startsWith("https://")) {
    throw new Error("SMOKY_YOUTUBE_RESUMABLE_URL_MISSING")
  }

  const uploaded = await fetcher(resumableUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(sourceBuffer.byteLength),
    },
    body: new Uint8Array(sourceBuffer),
    cache: "no-store",
    signal: AbortSignal.timeout(120_000),
  })

  const uploadBody = await safeJson(uploaded)
  if (!uploaded.ok) throw new Error(`SMOKY_YOUTUBE_UPLOAD_HTTP_${uploaded.status}`)
  const parsedUpload = uploadResponseSchema.safeParse(uploadBody)
  if (!parsedUpload.success) throw new Error("SMOKY_YOUTUBE_UPLOAD_RESULT_UNCERTAIN")

  return {
    youtubeVideoId: parsedUpload.data.id,
    channelId: channel.id,
    channelTitle: channel.title,
    privacyStatus: "private" as const,
    notifySubscribers: false as const,
  }
}

function recordKey(jobId: string) {
  return `${UPLOAD_PREFIX}:job:${jobId}`
}

function lockKey(jobId: string) {
  return `${UPLOAD_PREFIX}:lock:${jobId}`
}

async function saveRecord(redis: Redis, record: SmokyYouTubeUploadRecord) {
  await redis.set(recordKey(record.jobId), record, { ex: UPLOAD_TTL_SECONDS })
  return record
}

export async function getSmokyYouTubeUploadRecord(
  jobId: string,
  dependencies: Dependencies = {},
) {
  const redis = runtimeRedis(dependencies)
  if (!redis) return null
  const raw = await redis.get<unknown>(recordKey(jobId))
  const parsed = uploadRecordSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export async function autoUploadRenderedTwitchShort(
  job: TwitchShortRenderJob,
  dependencies: Dependencies = {},
) {
  const env = dependencies.env ?? process.env
  const config = getSmokyYouTubeConfiguration(env)
  if (!config.enabled) {
    return {
      status: "disabled" as const,
      errorCode: "SMOKY_YOUTUBE_AUTO_UPLOAD_DISABLED",
      youtubeVideoId: null,
    }
  }
  if (!config.configured || !config.expectedChannelId) {
    return {
      status: "not_configured" as const,
      errorCode: "SMOKY_YOUTUBE_NOT_CONFIGURED",
      youtubeVideoId: null,
    }
  }
  if (job.broadcasterId !== SMOKY_TWITCH_BROADCASTER_ID) {
    return {
      status: "blocked" as const,
      errorCode: "SMOKY_YOUTUBE_TWITCH_BROADCASTER_MISMATCH",
      youtubeVideoId: null,
    }
  }
  if (job.status !== "rendered") {
    return {
      status: "blocked" as const,
      errorCode: "SMOKY_YOUTUBE_RENDER_REQUIRED",
      youtubeVideoId: null,
    }
  }
  if (!job.publishMetadata?.youtube) {
    return {
      status: "blocked" as const,
      errorCode: "SMOKY_YOUTUBE_METADATA_REQUIRED",
      youtubeVideoId: null,
    }
  }

  const redis = runtimeRedis(dependencies)
  if (!redis) {
    return {
      status: "not_configured" as const,
      errorCode: "SMOKY_YOUTUBE_UPLOAD_STORE_UNAVAILABLE",
      youtubeVideoId: null,
    }
  }

  const existing = await getSmokyYouTubeUploadRecord(job.jobId, { ...dependencies, redis })
  if (existing?.status === "uploaded") {
    return {
      status: "uploaded" as const,
      errorCode: null,
      youtubeVideoId: existing.youtubeVideoId,
      channelTitle: existing.verifiedChannelTitle,
      duplicatePrevented: true,
    }
  }
  if (existing?.status === "uploading" || existing?.status === "uncertain") {
    return {
      status: "blocked" as const,
      errorCode: "SMOKY_YOUTUBE_UPLOAD_STATE_UNCERTAIN",
      youtubeVideoId: existing.youtubeVideoId,
    }
  }

  const claimToken = randomUUID()
  const claimed = await redis.set(lockKey(job.jobId), claimToken, {
    nx: true,
    ex: UPLOAD_LOCK_SECONDS,
  })
  if (claimed !== "OK") {
    return {
      status: "blocked" as const,
      errorCode: "SMOKY_YOUTUBE_UPLOAD_IN_PROGRESS",
      youtubeVideoId: null,
    }
  }

  const timestamp = nowIso(dependencies)
  await saveRecord(redis, uploadRecordSchema.parse({
    version: "smoky-youtube-upload-v1",
    jobId: job.jobId,
    status: "uploading",
    expectedChannelId: config.expectedChannelId,
    verifiedChannelTitle: null,
    youtubeVideoId: null,
    privacyStatus: "private",
    notifySubscribers: false,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    errorCode: null,
  }))

  try {
    const source = presignR2Object(
      "GET",
      job.outputObjectKey,
      { expiresInSeconds: 600 },
      env,
    )
    const uploaded = await uploadPrivateVideoToLockedSmokyChannel({
      sourceUrl: source.url,
      title: job.publishMetadata.youtube.title,
      description: job.publishMetadata.youtube.description,
      tags: job.publishMetadata.youtube.tags,
      hashtags: job.publishMetadata.youtube.hashtags,
      categoryId: DEFAULT_CATEGORY_ID,
    }, { ...dependencies, env })

    const done = uploadRecordSchema.parse({
      version: "smoky-youtube-upload-v1",
      jobId: job.jobId,
      status: "uploaded",
      expectedChannelId: config.expectedChannelId,
      verifiedChannelTitle: uploaded.channelTitle,
      youtubeVideoId: uploaded.youtubeVideoId,
      privacyStatus: "private",
      notifySubscribers: false,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: nowIso(dependencies),
      errorCode: null,
    })
    await saveRecord(redis, done)
    return {
      status: "uploaded" as const,
      errorCode: null,
      youtubeVideoId: done.youtubeVideoId,
      channelTitle: done.verifiedChannelTitle,
      duplicatePrevented: false,
    }
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 200) : "SMOKY_YOUTUBE_UPLOAD_FAILED"
    const uncertain = code === "SMOKY_YOUTUBE_UPLOAD_RESULT_UNCERTAIN"
    await saveRecord(redis, uploadRecordSchema.parse({
      version: "smoky-youtube-upload-v1",
      jobId: job.jobId,
      status: uncertain ? "uncertain" : "failed",
      expectedChannelId: config.expectedChannelId,
      verifiedChannelTitle: null,
      youtubeVideoId: null,
      privacyStatus: "private",
      notifySubscribers: false,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: nowIso(dependencies),
      errorCode: code,
    }))
    return {
      status: uncertain ? "blocked" as const : "failed" as const,
      errorCode: code,
      youtubeVideoId: null,
    }
  } finally {
    const current = await redis.get<string>(lockKey(job.jobId)).catch(() => null)
    if (current === claimToken) {
      await redis.del(lockKey(job.jobId)).catch(() => null)
    }
  }
}
