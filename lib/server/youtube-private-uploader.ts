import { Redis } from "@upstash/redis"
import { z } from "zod"

import {
  getRenderedShortPreview,
  type TwitchShortRenderJob,
} from "@/lib/server/twitch-short-render-jobs"
import {
  getStoredYouTubeOwnerCredential,
  resolveYouTubeOAuthClient,
  SMOKYBANANA03_YOUTUBE_CHANNEL_ID,
} from "@/lib/server/youtube-owner-connection"

export const YOUTUBE_PRIVATE_UPLOAD_VERSION = "youtube-private-upload-v1" as const

const YOUTUBE_UPLOAD_TTL_SECONDS = 60 * 60 * 24 * 180
const YOUTUBE_UPLOAD_KEY_PREFIX = "ams:youtube-private-upload:v1:job:"
const MAX_VIDEO_BYTES = 250 * 1024 * 1024

export const youtubePrivateUploadRecordSchema = z.object({
  version: z.literal(YOUTUBE_PRIVATE_UPLOAD_VERSION),
  renderJobId: z.string().min(1).max(200),
  clipId: z.string().min(1).max(160),
  status: z.enum(["pending", "uploading", "succeeded", "failed", "reconciliation"]),
  privacyStatus: z.literal("private"),
  youtubeVideoId: z.string().min(1).max(80).nullable(),
  channelId: z.string().min(1).max(120).nullable(),
  attempts: z.number().int().min(0).max(10),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  errorCode: z.string().max(200).nullable(),
}).strict()

export type YouTubePrivateUploadRecord = z.infer<typeof youtubePrivateUploadRecordSchema>

type RedisLike = Pick<Redis, "get" | "set">

type Options = {
  env?: NodeJS.ProcessEnv
  redis?: RedisLike | null
  fetcher?: typeof fetch
  now?: () => Date
  getRenderedShort?: (
    jobId: string,
  ) => Promise<{ job: TwitchShortRenderJob; previewUrl: string } | null>
}

function clean(value: string | undefined) {
  const result = value?.trim()
  return result || null
}

function isPlaceholder(value: string | null) {
  return Boolean(value && /(?:replace|placeholder|changeme|your)[-_ ]/iu.test(value))
}

function resolveRedis(env: NodeJS.ProcessEnv): RedisLike | null {
  const url = clean(env.UPSTASH_REDIS_REST_URL) ?? clean(env.KV_REST_API_URL)
  const token = clean(env.UPSTASH_REDIS_REST_TOKEN) ?? clean(env.KV_REST_API_TOKEN)
  return url && token ? new Redis({ url, token }) : null
}

function runtimeRedis(options: Options): RedisLike | null {
  if (Object.prototype.hasOwnProperty.call(options, "redis")) return options.redis ?? null
  return resolveRedis(options.env ?? process.env)
}

function nowIso(options: Options) {
  return (options.now ?? (() => new Date()))().toISOString()
}

function uploadKey(renderJobId: string) {
  return `${YOUTUBE_UPLOAD_KEY_PREFIX}${renderJobId}`
}

function parseRecord(raw: unknown): YouTubePrivateUploadRecord | null {
  if (!raw) return null
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw
    const parsed = youtubePrivateUploadRecordSchema.safeParse(value)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

async function saveRecord(record: YouTubePrivateUploadRecord, redis: RedisLike) {
  const parsed = youtubePrivateUploadRecordSchema.parse(record)
  await redis.set(uploadKey(parsed.renderJobId), JSON.stringify(parsed), {
    ex: YOUTUBE_UPLOAD_TTL_SECONDS,
  })
  return parsed
}

function youtubeConfig(env: NodeJS.ProcessEnv = process.env) {
  const client = resolveYouTubeOAuthClient(env)
  const clientId = client?.clientId ?? null
  const clientSecret = client?.clientSecret ?? null
  const refreshToken = clean(env.AMS_YOUTUBE_REFRESH_TOKEN)
  const configuredChannel = clean(env.AMS_YOUTUBE_CHANNEL_ID)
  const channelId =
    configuredChannel && /^UC[A-Za-z0-9_-]{20,40}$/u.test(configuredChannel)
      ? configuredChannel
      : SMOKYBANANA03_YOUTUBE_CHANNEL_ID

  const configured = Boolean(
    clientId &&
      clientSecret &&
      refreshToken &&
      !isPlaceholder(clientId) &&
      !isPlaceholder(clientSecret) &&
      !isPlaceholder(refreshToken) &&
      channelId === SMOKYBANANA03_YOUTUBE_CHANNEL_ID,
  )

  return { clientId, clientSecret, refreshToken, channelId, configured }
}

async function runtimeYouTubeConfig(options: Options) {
  const env = options.env ?? process.env
  const legacy = youtubeConfig(env)
  if (legacy.configured) return legacy

  try {
    const stored = await getStoredYouTubeOwnerCredential({
      env,
      redis: runtimeRedis(options),
    })
    const client = resolveYouTubeOAuthClient(env)
    if (
      stored &&
      client &&
      stored.channelId === SMOKYBANANA03_YOUTUBE_CHANNEL_ID
    ) {
      return {
        clientId: client.clientId,
        clientSecret: client.clientSecret,
        refreshToken: stored.refreshToken,
        channelId: stored.channelId,
        configured: true,
      }
    }
  } catch {
    // Keep the uploader fail-closed if the encrypted connection vault is unavailable.
  }

  return legacy
}

export function getYouTubePrivateUploaderConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const config = youtubeConfig(env)
  return {
    configured: config.configured,
    privacyStatus: "private" as const,
    expectedChannelConfigured: Boolean(config.channelId),
  }
}

export async function getYouTubePrivateUploadRecord(
  renderJobId: string,
  options: Options = {},
) {
  const redis = runtimeRedis(options)
  if (!redis) return null
  return parseRecord(await redis.get<unknown>(uploadKey(renderJobId)))
}

async function accessToken(config: ReturnType<typeof youtubeConfig>, fetcher: typeof fetch) {
  if (!config.configured || !config.clientId || !config.clientSecret || !config.refreshToken) {
    throw new Error("YOUTUBE_UPLOADER_NOT_CONFIGURED")
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: "refresh_token",
  })

  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  })

  const json = (await response.json().catch(() => null)) as { access_token?: unknown } | null
  if (!response.ok) throw new Error(`YOUTUBE_OAUTH_HTTP_${response.status}`)
  const token = typeof json?.access_token === "string" ? json.access_token.trim() : ""
  if (!token) throw new Error("YOUTUBE_OAUTH_ACCESS_TOKEN_MISSING")
  return token
}

async function authorizedChannelId(
  token: string,
  expectedChannelId: string,
  fetcher: typeof fetch,
) {
  const response = await fetcher(
    "https://www.googleapis.com/youtube/v3/channels?part=id&mine=true&maxResults=50",
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  )
  const json = (await response.json().catch(() => null)) as
    | { items?: Array<{ id?: unknown }> }
    | null
  if (!response.ok) throw new Error(`YOUTUBE_CHANNEL_HTTP_${response.status}`)
  const actual = (json?.items ?? [])
    .map((item) => (typeof item.id === "string" ? item.id.trim() : ""))
    .find((id) => id === expectedChannelId)
  if (!actual) throw new Error("YOUTUBE_CHANNEL_MISMATCH")
  return actual
}

function canonicalText(value: string) {
  return value.replace(/\r\n?/gu, "\n").normalize("NFC").trim()
}

function normalizeTag(tag: string) {
  return canonicalText(tag).slice(0, 80)
}

function tagKey(tag: string) {
  return normalizeTag(tag).toLocaleLowerCase("en-US")
}

function uniqueTags(tags: string[]) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of tags) {
    const tag = normalizeTag(raw)
    const key = tagKey(tag)
    if (!tag || !key || seen.has(key)) continue
    seen.add(key)
    result.push(tag)
    if (result.length >= 20) break
  }
  return result
}

function comparableTags(tags: string[]) {
  return [...new Set(tags.map(tagKey).filter(Boolean))].sort()
}

function metadataFor(job: TwitchShortRenderJob) {
  const youtube = job.publishMetadata?.youtube
  if (!youtube) throw new Error("YOUTUBE_UPLOAD_METADATA_REQUIRED")
  return {
    title: canonicalText(youtube.title).slice(0, 100),
    description: canonicalText(youtube.description).slice(0, 5_000),
    tags: uniqueTags(youtube.tags),
  }
}

async function markFailure(
  record: YouTubePrivateUploadRecord,
  errorCode: string,
  redis: RedisLike,
  options: Options,
  ambiguous = false,
) {
  return saveRecord(
    {
      ...record,
      status: ambiguous ? "reconciliation" : "failed",
      updatedAt: nowIso(options),
      completedAt: ambiguous ? null : nowIso(options),
      errorCode: errorCode.slice(0, 200),
    },
    redis,
  )
}

export async function uploadRenderedTwitchShortPrivate(
  input: { renderJobId: string; approved: boolean },
  options: Options = {},
) {
  if (!input.approved) throw new Error("YOUTUBE_PRIVATE_UPLOAD_APPROVAL_REQUIRED")

  const env = options.env ?? process.env
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("YOUTUBE_UPLOAD_STORE_UNAVAILABLE")

  const existing = await getYouTubePrivateUploadRecord(input.renderJobId, {
    ...options,
    redis,
  })
  if (existing?.status === "succeeded") {
    return { record: existing, reused: true }
  }
  if (existing?.status === "uploading" || existing?.status === "reconciliation") {
    throw new Error("YOUTUBE_UPLOAD_RECONCILIATION_REQUIRED")
  }

  const config = await runtimeYouTubeConfig({ ...options, env, redis })
  if (!config.configured || !config.channelId) throw new Error("YOUTUBE_UPLOADER_NOT_CONFIGURED")

  const rendered = await (options.getRenderedShort ?? ((jobId) => getRenderedShortPreview(jobId)))(
    input.renderJobId,
  )
  if (!rendered || rendered.job.status !== "rendered") {
    throw new Error("YOUTUBE_RENDERED_SHORT_NOT_READY")
  }

  const metadata = metadataFor(rendered.job)
  const timestamp = nowIso(options)
  let record = await saveRecord(
    {
      version: YOUTUBE_PRIVATE_UPLOAD_VERSION,
      renderJobId: rendered.job.jobId,
      clipId: rendered.job.clipId,
      status: "pending",
      privacyStatus: "private",
      youtubeVideoId: null,
      channelId: null,
      attempts: (existing?.attempts ?? 0) + 1,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      completedAt: null,
      errorCode: null,
    },
    redis,
  )

  const fetcher = options.fetcher ?? fetch

  try {
    const token = await accessToken(config, fetcher)
    const channelId = await authorizedChannelId(token, config.channelId, fetcher)

    const sourceResponse = await fetcher(rendered.previewUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    })
    if (!sourceResponse.ok) {
      return {
        record: await markFailure(
          record,
          `YOUTUBE_SOURCE_HTTP_${sourceResponse.status}`,
          redis,
          options,
        ),
        reused: false,
      }
    }

    const bytes = new Uint8Array(await sourceResponse.arrayBuffer())
    if (!bytes.byteLength) {
      return {
        record: await markFailure(record, "YOUTUBE_SOURCE_EMPTY", redis, options),
        reused: false,
      }
    }
    if (bytes.byteLength > MAX_VIDEO_BYTES) {
      return {
        record: await markFailure(record, "YOUTUBE_SOURCE_TOO_LARGE", redis, options),
        reused: false,
      }
    }

    const start = await fetcher(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet%2Cstatus&notifySubscribers=false",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Length": String(bytes.byteLength),
          "X-Upload-Content-Type": "video/mp4",
        },
        body: JSON.stringify({
          snippet: {
            title: metadata.title,
            description: metadata.description,
            tags: metadata.tags,
            categoryId: "20",
          },
          status: {
            privacyStatus: "private",
            embeddable: true,
          },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      },
    )

    if (!start.ok) {
      return {
        record: await markFailure(
          record,
          `YOUTUBE_UPLOAD_INIT_HTTP_${start.status}`,
          redis,
          options,
        ),
        reused: false,
      }
    }

    const uploadUrl = start.headers.get("location")?.trim()
    if (!uploadUrl) {
      return {
        record: await markFailure(record, "YOUTUBE_UPLOAD_LOCATION_MISSING", redis, options),
        reused: false,
      }
    }

    record = await saveRecord(
      {
        ...record,
        status: "uploading",
        channelId,
        updatedAt: nowIso(options),
      },
      redis,
    )

    let uploaded: Response
    try {
      uploaded = await fetcher(uploadUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "video/mp4",
          "Content-Length": String(bytes.byteLength),
        },
        body: bytes,
        cache: "no-store",
        signal: AbortSignal.timeout(180_000),
      })
    } catch {
      return {
        record: await markFailure(
          record,
          "YOUTUBE_UPLOAD_AMBIGUOUS",
          redis,
          options,
          true,
        ),
        reused: false,
      }
    }

    const uploadedJson = (await uploaded.json().catch(() => null)) as
      | { id?: unknown; status?: { privacyStatus?: unknown } }
      | null

    if (!uploaded.ok) {
      return {
        record: await markFailure(
          record,
          `YOUTUBE_UPLOAD_HTTP_${uploaded.status}`,
          redis,
          options,
        ),
        reused: false,
      }
    }

    const videoId = typeof uploadedJson?.id === "string" ? uploadedJson.id.trim() : ""
    if (!videoId) {
      return {
        record: await markFailure(
          record,
          "YOUTUBE_UPLOAD_ID_MISSING",
          redis,
          options,
          true,
        ),
        reused: false,
      }
    }

    const verify = await fetcher(
      `https://www.googleapis.com/youtube/v3/videos?part=id%2Csnippet%2Cstatus&id=${encodeURIComponent(videoId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      },
    )
    const verifyJson = (await verify.json().catch(() => null)) as
      | {
          items?: Array<{
            id?: unknown
            snippet?: { channelId?: unknown }
            status?: { privacyStatus?: unknown }
          }>
        }
      | null

    if (!verify.ok) {
      return {
        record: await markFailure(
          record,
          `YOUTUBE_VERIFY_HTTP_${verify.status}`,
          redis,
          options,
          true,
        ),
        reused: false,
      }
    }

    const verified = verifyJson?.items?.[0]
    const verifiedId = typeof verified?.id === "string" ? verified.id.trim() : ""
    const verifiedChannel =
      typeof verified?.snippet?.channelId === "string" ? verified.snippet.channelId.trim() : ""
    const privacy =
      typeof verified?.status?.privacyStatus === "string"
        ? verified.status.privacyStatus.trim()
        : ""

    if (verifiedId !== videoId || verifiedChannel !== channelId || privacy !== "private") {
      return {
        record: await markFailure(
          record,
          "YOUTUBE_UPLOAD_VERIFICATION_MISMATCH",
          redis,
          options,
          true,
        ),
        reused: false,
      }
    }

    const succeeded = await saveRecord(
      {
        ...record,
        status: "succeeded",
        youtubeVideoId: videoId,
        channelId,
        updatedAt: nowIso(options),
        completedAt: nowIso(options),
        errorCode: null,
      },
      redis,
    )

    return { record: succeeded, reused: false }
  } catch (error) {
    const code = error instanceof Error ? error.message : "YOUTUBE_UPLOAD_FAILED"
    return {
      record: await markFailure(record, code, redis, options),
      reused: false,
    }
  }
}

/** Read back the existing video; this path never uploads or alters YouTube content. */
export async function verifyRenderedTwitchShortPrivate(renderJobId: string, options: Options = {}) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("YOUTUBE_UPLOAD_STORE_UNAVAILABLE")
  const record = await getYouTubePrivateUploadRecord(renderJobId, { ...options, redis })
  if (
    record?.status !== "succeeded" || !record.youtubeVideoId ||
    record.channelId !== SMOKYBANANA03_YOUTUBE_CHANNEL_ID
  ) throw new Error("YOUTUBE_UPLOAD_VERIFIED_RECORD_REQUIRED")
  const rendered = await (options.getRenderedShort ?? ((jobId) => getRenderedShortPreview(jobId)))(renderJobId)
  if (!rendered || rendered.job.status !== "rendered" || rendered.job.jobId !== record.renderJobId) {
    throw new Error("YOUTUBE_RENDERED_SHORT_NOT_READY")
  }
  const metadata = metadataFor(rendered.job)
  const config = await runtimeYouTubeConfig({ ...options, redis })
  const fetcher = options.fetcher ?? fetch
  const token = await accessToken(config, fetcher)
  const response = await fetcher(
    `https://www.googleapis.com/youtube/v3/videos?part=id%2Csnippet%2Cstatus&id=${encodeURIComponent(record.youtubeVideoId)}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) },
  )
  if (!response.ok) throw new Error(`YOUTUBE_VERIFY_HTTP_${response.status}`)
  const payload: unknown = await response.json().catch(() => null)
  const videoSchema = z.object({
    id: z.string(),
    snippet: z.object({
      channelId: z.string(), title: z.string(), description: z.string(),
      tags: z.array(z.string()).default([]), categoryId: z.string(),
    }),
    status: z.object({ privacyStatus: z.string() }),
  })
  const parsed = z.object({ items: z.array(videoSchema) }).safeParse(payload)
  const video = parsed.success ? parsed.data.items.find(item => item.id === record.youtubeVideoId) : null
  if (
    !video || video.snippet.channelId !== SMOKYBANANA03_YOUTUBE_CHANNEL_ID ||
    video.status.privacyStatus !== "private"
  ) throw new Error("YOUTUBE_UPLOAD_VERIFICATION_MISMATCH")
  if (canonicalText(video.snippet.title) !== canonicalText(metadata.title)) {
    throw new Error("YOUTUBE_UPLOAD_METADATA_TITLE_MISMATCH")
  }
  if (canonicalText(video.snippet.description) !== canonicalText(metadata.description)) {
    throw new Error("YOUTUBE_UPLOAD_METADATA_DESCRIPTION_MISMATCH")
  }
  if (video.snippet.categoryId !== "20") {
    throw new Error("YOUTUBE_UPLOAD_METADATA_CATEGORY_MISMATCH")
  }
  if (JSON.stringify(comparableTags(video.snippet.tags)) !== JSON.stringify(comparableTags(metadata.tags))) {
    throw new Error("YOUTUBE_UPLOAD_METADATA_TAGS_MISMATCH")
  }
  const proof = {
    renderJobId: record.renderJobId,
    videoId: video.id,
    channelId: video.snippet.channelId,
    privacyStatus: video.status.privacyStatus,
    metadataVerified: true,
    categoryId: video.snippet.categoryId,
    // YouTube does not return notifySubscribers in videos.list. The uploader
    // always sends notifySubscribers=false in the original videos.insert request.
    notifySubscribers: false,
    notificationEvidence: "upload-request-policy",
    verificationSource: "youtube-data-api",
    verifiedAt: nowIso(options),
  }
  const proofKey = `ams:youtube-private-upload:v1:verification:${renderJobId}`
  await redis.set(proofKey, JSON.stringify(proof), { ex: YOUTUBE_UPLOAD_TTL_SECONDS })
  const stored = await redis.get<unknown>(proofKey)
  const durable = typeof stored === "string" ? JSON.parse(stored) : stored
  if (!durable || typeof durable !== "object" || !("videoId" in durable) || durable.videoId !== proof.videoId) {
    throw new Error("YOUTUBE_VERIFICATION_STORE_FAILED")
  }
  return proof
}
