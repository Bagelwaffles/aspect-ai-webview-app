import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createSecretKey,
  randomBytes,
  randomUUID,
  timingSafeEqual,
  type KeyObject,
} from "node:crypto"

import { Redis } from "@upstash/redis"
import { z } from "zod"

import {
  isR2AssetStorageConfigured,
  presignR2Object,
} from "@/lib/server/r2-presign"
import {
  getSmokyYouTubeConfiguration,
  getVerifiedSmokyYouTubeAccess,
} from "@/lib/server/smoky-youtube-uploader"

export const SMOKY_YOUTUBE_VOD_UPLOAD_VERSION = "smoky-youtube-vod-upload-v1" as const

const JOB_PREFIX = "ams:smoky-youtube-vod:v1:job:"
const INDEX_KEY = "ams:smoky-youtube-vod:v1:index"
const IDEMPOTENCY_PREFIX = "ams:smoky-youtube-vod:v1:vod:"
const CLAIM_LOCK_PREFIX = "ams:smoky-youtube-vod:v1:claim:"
const JOB_TTL_SECONDS = 60 * 60 * 24 * 180
const LEASE_TTL_MS = 6 * 60 * 60 * 1000
const CLAIM_LOCK_SECONDS = 60
const MAX_INDEX_JOBS = 100
const MAX_ATTEMPTS = 5
const MAX_YOUTUBE_BYTES = 256 * 1024 * 1024 * 1024
const SOURCE_PREFIX = "creators/twitch/155477801/"
const DEFAULT_CATEGORY_ID = "20"

const metadataSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(5_000),
  tags: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  hashtags: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  categoryId: z.string().trim().regex(/^\d{1,6}$/u).default(DEFAULT_CATEGORY_ID),
}).strict()

const encryptedSessionSchema = z.object({
  cipherText: z.string().min(1),
  iv: z.string().min(1),
  authTag: z.string().min(1),
})

export const smokyYouTubeVodUploadJobSchema = z.object({
  version: z.literal(SMOKY_YOUTUBE_VOD_UPLOAD_VERSION),
  jobId: z.string().uuid(),
  twitchVodId: z.string().trim().min(1).max(160),
  sourceObjectKey: z.string().trim().min(1).max(1_000),
  sourceBytes: z.number().int().positive().max(MAX_YOUTUBE_BYTES).nullable(),
  contentType: z.string().trim().min(1).max(120).nullable(),
  metadata: metadataSchema,
  status: z.enum(["pending", "uploading", "uploaded", "failed", "uncertain"]),
  attempts: z.number().int().min(0).max(MAX_ATTEMPTS),
  expectedChannelId: z.string().nullable(),
  verifiedChannelTitle: z.string().nullable(),
  youtubeVideoId: z.string().nullable(),
  privacyStatus: z.literal("private"),
  notifySubscribers: z.literal(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  claimedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  errorCode: z.string().max(200).nullable(),
  leaseHash: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  leaseExpiresAt: z.string().datetime().nullable(),
  resumableSession: encryptedSessionSchema.nullable(),
}).strict()

export type SmokyYouTubeVodUploadJob = z.infer<typeof smokyYouTubeVodUploadJobSchema>

type Options = {
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

function runtimeRedis(options: Options) {
  if (Object.prototype.hasOwnProperty.call(options, "redis")) return options.redis ?? null
  return resolveRedis(options.env ?? process.env)
}

function now(options: Options) {
  return (options.now ?? (() => new Date()))()
}

function encryptionKey(env: NodeJS.ProcessEnv): KeyObject | null {
  const raw = clean(env.AMS_CONNECTION_ENCRYPTION_KEY)
  if (!raw) return null
  try {
    const decoded = Buffer.from(raw, "base64")
    if (decoded.length !== 32) return null
    return createSecretKey(Uint8Array.from(decoded))
  } catch {
    return null
  }
}

function vodEnabled(env: NodeJS.ProcessEnv) {
  return clean(env.AMS_SMOKY_YOUTUBE_VOD_UPLOAD_ENABLED)?.toLowerCase() === "true"
}

export function getSmokyYouTubeVodUploadConfiguration(
  env: NodeJS.ProcessEnv = process.env,
) {
  const youtube = getSmokyYouTubeConfiguration(env)
  return {
    enabled: vodEnabled(env),
    configured:
      youtube.configured &&
      Boolean(resolveRedis(env)) &&
      Boolean(encryptionKey(env)) &&
      isR2AssetStorageConfigured(env),
  }
}

function safeSourceObjectKey(value: string) {
  const key = value.trim()
  return (
    key.startsWith(SOURCE_PREFIX) &&
    key.includes("/vods/") &&
    !key.startsWith("/") &&
    !key.includes("..") &&
    !key.includes("\\")
  )
}

export function validateSmokyVodSourceObjectKey(value: string) {
  if (!safeSourceObjectKey(value)) throw new Error("SMOKY_VOD_SOURCE_OBJECT_INVALID")
  return value.trim()
}

function jobKey(jobId: string) {
  return `${JOB_PREFIX}${jobId}`
}

function idempotencyKey(vodId: string) {
  return `${IDEMPOTENCY_PREFIX}${vodId}`
}

function claimLockKey(jobId: string) {
  return `${CLAIM_LOCK_PREFIX}${jobId}`
}

function parseJob(raw: unknown): SmokyYouTubeVodUploadJob | null {
  if (!raw) return null
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw
    const parsed = smokyYouTubeVodUploadJobSchema.safeParse(value)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

async function saveJob(redis: Redis, job: SmokyYouTubeVodUploadJob) {
  await redis.set(jobKey(job.jobId), job, { ex: JOB_TTL_SECONDS })
  return job
}

export async function getSmokyYouTubeVodUploadJob(
  jobId: string,
  options: Options = {},
) {
  const redis = runtimeRedis(options)
  if (!redis) return null
  return parseJob(await redis.get<unknown>(jobKey(jobId)))
}

function leaseTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function leaseActive(job: SmokyYouTubeVodUploadJob, at: Date) {
  return Boolean(job.leaseHash && job.leaseExpiresAt && Date.parse(job.leaseExpiresAt) > at.getTime())
}

function validateLease(job: SmokyYouTubeVodUploadJob, token: string, at: Date) {
  if (!leaseActive(job, at) || !job.leaseHash) return false
  const expected = Buffer.from(job.leaseHash, "hex")
  const actual = Buffer.from(leaseTokenHash(token), "hex")
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function encryptSession(url: string, key: KeyObject) {
  const iv = Uint8Array.from(randomBytes(12))
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const cipherText = cipher.update(url, "utf8", "hex") + cipher.final("hex")
  return encryptedSessionSchema.parse({
    cipherText,
    iv: Buffer.from(iv).toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  })
}

function decryptSession(session: z.infer<typeof encryptedSessionSchema>, key: KeyObject) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Uint8Array.from(Buffer.from(session.iv, "base64")),
  )
  decipher.setAuthTag(Uint8Array.from(Buffer.from(session.authTag, "base64")))
  return decipher.update(session.cipherText, "hex", "utf8") + decipher.final("utf8")
}

function descriptionWithHashtags(description: string, hashtags: string[]) {
  const cleanTags = hashtags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag.replace(/\s+/gu, "")}`))
  const suffix = cleanTags.length ? `\n\n${cleanTags.join(" ")}` : ""
  return `${description.trim()}${suffix}`.slice(0, 5_000)
}

async function inspectSource(
  objectKey: string,
  env: NodeJS.ProcessEnv,
  fetcher: typeof fetch,
) {
  const signed = presignR2Object("HEAD", objectKey, { expiresInSeconds: 300 }, env)
  const response = await fetcher(signed.url, {
    method: "HEAD",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`SMOKY_VOD_SOURCE_HEAD_HTTP_${response.status}`)

  const size = Number(response.headers.get("content-length") ?? "")
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_YOUTUBE_BYTES) {
    throw new Error("SMOKY_VOD_SOURCE_SIZE_INVALID")
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "video/mp4"
  if (!contentType.startsWith("video/") && contentType !== "application/octet-stream") {
    throw new Error("SMOKY_VOD_SOURCE_TYPE_INVALID")
  }

  return { size, contentType }
}

async function createResumableSession(
  job: SmokyYouTubeVodUploadJob,
  source: { size: number; contentType: string },
  options: Options,
) {
  const env = options.env ?? process.env
  const fetcher = options.fetch ?? fetch
  const verified = await getVerifiedSmokyYouTubeAccess({ env, fetch: fetcher })

  const uploadUrl = new URL("https://www.googleapis.com/upload/youtube/v3/videos")
  uploadUrl.searchParams.set("uploadType", "resumable")
  uploadUrl.searchParams.set("part", "snippet,status")
  uploadUrl.searchParams.set("notifySubscribers", "false")

  const response = await fetcher(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${verified.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(source.size),
      "X-Upload-Content-Type": source.contentType,
    },
    body: JSON.stringify({
      snippet: {
        title: job.metadata.title,
        description: descriptionWithHashtags(job.metadata.description, job.metadata.hashtags),
        tags: [...new Set(job.metadata.tags)].slice(0, 20),
        categoryId: job.metadata.categoryId,
      },
      status: {
        privacyStatus: "private",
      },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`SMOKY_VOD_YOUTUBE_INIT_HTTP_${response.status}`)

  const resumableUrl = response.headers.get("location")?.trim()
  if (!resumableUrl?.startsWith("https://www.googleapis.com/")) {
    throw new Error("SMOKY_VOD_YOUTUBE_SESSION_INVALID")
  }

  return {
    resumableUrl,
    accessToken: verified.accessToken,
    accessExpiresInSeconds: verified.expiresInSeconds,
    expectedChannelId: verified.expectedChannelId,
    channelTitle: verified.channel.title,
  }
}

export async function enqueueSmokyYouTubeVodUpload(
  input: {
    twitchVodId: string
    sourceObjectKey: string
    metadata: z.input<typeof metadataSchema>
  },
  options: Options = {},
) {
  const env = options.env ?? process.env
  const redis = runtimeRedis(options)
  if (!redis || !encryptionKey(env) || !isR2AssetStorageConfigured(env)) {
    throw new Error("SMOKY_VOD_UPLOAD_STORE_NOT_CONFIGURED")
  }

  const twitchVodId = input.twitchVodId.trim()
  if (!twitchVodId || twitchVodId.length > 160) throw new Error("SMOKY_VOD_ID_INVALID")
  const sourceObjectKey = validateSmokyVodSourceObjectKey(input.sourceObjectKey)
  const metadata = metadataSchema.parse(input.metadata)

  const existingId = await redis.get<string>(idempotencyKey(twitchVodId))
  if (existingId) {
    const existing = await getSmokyYouTubeVodUploadJob(existingId, { ...options, redis })
    if (existing) return { job: existing, duplicatePrevented: true }
  }

  const jobId = randomUUID()
  const reserved = await redis.set(idempotencyKey(twitchVodId), jobId, {
    nx: true,
    ex: JOB_TTL_SECONDS,
  })
  if (reserved !== "OK") {
    const winner = await redis.get<string>(idempotencyKey(twitchVodId))
    const existing = winner
      ? await getSmokyYouTubeVodUploadJob(winner, { ...options, redis })
      : null
    if (existing) return { job: existing, duplicatePrevented: true }
    throw new Error("SMOKY_VOD_IDEMPOTENCY_STATE_UNAVAILABLE")
  }

  const timestamp = now(options).toISOString()
  const job = smokyYouTubeVodUploadJobSchema.parse({
    version: SMOKY_YOUTUBE_VOD_UPLOAD_VERSION,
    jobId,
    twitchVodId,
    sourceObjectKey,
    sourceBytes: null,
    contentType: null,
    metadata,
    status: "pending",
    attempts: 0,
    expectedChannelId: null,
    verifiedChannelTitle: null,
    youtubeVideoId: null,
    privacyStatus: "private",
    notifySubscribers: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    claimedAt: null,
    completedAt: null,
    errorCode: null,
    leaseHash: null,
    leaseExpiresAt: null,
    resumableSession: null,
  })
  await saveJob(redis, job)
  await redis.lpush(INDEX_KEY, jobId)
  await redis.ltrim(INDEX_KEY, 0, MAX_INDEX_JOBS - 1)
  return { job, duplicatePrevented: false }
}

function publicJob(job: SmokyYouTubeVodUploadJob) {
  const { leaseHash: _leaseHash, resumableSession: _resumableSession, ...safe } = job
  return safe
}

export async function claimNextSmokyYouTubeVodUpload(
  options: Options = {},
) {
  const env = options.env ?? process.env
  const redis = runtimeRedis(options)
  const key = encryptionKey(env)
  const config = getSmokyYouTubeVodUploadConfiguration(env)
  if (!config.enabled || !config.configured || !redis || !key) {
    throw new Error("SMOKY_VOD_UPLOAD_NOT_CONFIGURED")
  }

  const ids = await redis.lrange<string>(INDEX_KEY, 0, MAX_INDEX_JOBS - 1)
  const at = now(options)

  for (const jobId of ids) {
    const job = await getSmokyYouTubeVodUploadJob(jobId, { ...options, redis })
    if (!job || job.status === "uploaded" || job.status === "uncertain") continue
    if (job.attempts >= MAX_ATTEMPTS) continue
    if (job.status === "uploading" && leaseActive(job, at)) continue
    if (!["pending", "uploading"].includes(job.status)) continue

    const claimToken = randomUUID()
    const locked = await redis.set(claimLockKey(job.jobId), claimToken, {
      nx: true,
      ex: CLAIM_LOCK_SECONDS,
    })
    if (locked !== "OK") continue

    try {
      const latest = await getSmokyYouTubeVodUploadJob(job.jobId, { ...options, redis })
      if (!latest || latest.status === "uploaded" || latest.status === "uncertain") continue
      if (latest.status === "uploading" && leaseActive(latest, at)) continue

      const source = await inspectSource(latest.sourceObjectKey, env, options.fetch ?? fetch)
      let resumableUrl = latest.resumableSession
        ? decryptSession(latest.resumableSession, key)
        : null

      const verified = await getVerifiedSmokyYouTubeAccess({
        env,
        fetch: options.fetch ?? fetch,
      })

      if (!resumableUrl) {
        const created = await createResumableSession(latest, source, options)
        resumableUrl = created.resumableUrl
      }

      const rawLease = randomBytes(32).toString("base64url")
      const leaseExpiresAt = new Date(at.getTime() + LEASE_TTL_MS).toISOString()
      const next = smokyYouTubeVodUploadJobSchema.parse({
        ...latest,
        sourceBytes: source.size,
        contentType: source.contentType,
        status: "uploading",
        attempts: latest.attempts + 1,
        expectedChannelId: verified.expectedChannelId,
        verifiedChannelTitle: verified.channel.title,
        updatedAt: at.toISOString(),
        claimedAt: at.toISOString(),
        errorCode: null,
        leaseHash: leaseTokenHash(rawLease),
        leaseExpiresAt,
        resumableSession: encryptSession(resumableUrl, key),
      })
      await saveJob(redis, next)

      const sourceUrl = presignR2Object(
        "GET",
        next.sourceObjectKey,
        { expiresInSeconds: 900 },
        env,
      )

      return {
        job: publicJob(next),
        leaseToken: rawLease,
        resumableUrl,
        accessToken: verified.accessToken,
        accessExpiresInSeconds: verified.expiresInSeconds,
        source: {
          url: sourceUrl.url,
          expiresInSeconds: sourceUrl.expiresInSeconds,
          bytes: source.size,
          contentType: source.contentType,
        },
      }
    } finally {
      const current = await redis.get<string>(claimLockKey(job.jobId)).catch(() => null)
      if (current === claimToken) {
        await redis.del(claimLockKey(job.jobId)).catch(() => null)
      }
    }
  }

  return { job: null }
}

async function authorizedLeasedJob(
  jobId: string,
  leaseToken: string,
  options: Options,
) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("SMOKY_VOD_UPLOAD_STORE_NOT_CONFIGURED")
  const job = await getSmokyYouTubeVodUploadJob(jobId, { ...options, redis })
  if (!job) throw new Error("SMOKY_VOD_UPLOAD_JOB_NOT_FOUND")
  if (!leaseToken || !validateLease(job, leaseToken, now(options))) {
    throw new Error("SMOKY_VOD_UPLOAD_LEASE_INVALID")
  }
  return { job, redis }
}

export async function renewSmokyVodSourceUrl(
  jobId: string,
  leaseToken: string,
  options: Options = {},
) {
  const env = options.env ?? process.env
  const { job } = await authorizedLeasedJob(jobId, leaseToken, options)
  const source = presignR2Object("GET", job.sourceObjectKey, { expiresInSeconds: 900 }, env)
  return {
    url: source.url,
    expiresInSeconds: source.expiresInSeconds,
    bytes: job.sourceBytes,
    contentType: job.contentType,
  }
}

export async function renewSmokyVodYouTubeAccess(
  jobId: string,
  leaseToken: string,
  options: Options = {},
) {
  const env = options.env ?? process.env
  const { job } = await authorizedLeasedJob(jobId, leaseToken, options)
  if (job.status !== "uploading") throw new Error("SMOKY_VOD_UPLOAD_NOT_ACTIVE")
  const verified = await getVerifiedSmokyYouTubeAccess({
    env,
    fetch: options.fetch ?? fetch,
  })
  if (job.expectedChannelId && verified.expectedChannelId !== job.expectedChannelId) {
    throw new Error("SMOKY_YOUTUBE_CHANNEL_MISMATCH")
  }
  return {
    accessToken: verified.accessToken,
    expiresInSeconds: verified.expiresInSeconds,
    channelId: verified.expectedChannelId,
    channelTitle: verified.channel.title,
  }
}

export async function completeSmokyYouTubeVodUpload(
  input: {
    jobId: string
    leaseToken: string
    ok: boolean
    youtubeVideoId?: string | null
    errorCode?: string | null
    retriable?: boolean
    uncertain?: boolean
    sessionExpired?: boolean
  },
  options: Options = {},
) {
  const env = options.env ?? process.env
  const key = encryptionKey(env)
  const { job, redis } = await authorizedLeasedJob(input.jobId, input.leaseToken, options)
  if (!key) throw new Error("SMOKY_VOD_UPLOAD_NOT_CONFIGURED")
  if (job.status === "uploaded") return publicJob(job)

  const timestamp = now(options).toISOString()
  if (input.ok) {
    const youtubeVideoId = input.youtubeVideoId?.trim()
    if (!youtubeVideoId) throw new Error("SMOKY_VOD_YOUTUBE_VIDEO_ID_REQUIRED")
    const next = smokyYouTubeVodUploadJobSchema.parse({
      ...job,
      status: "uploaded",
      youtubeVideoId,
      updatedAt: timestamp,
      completedAt: timestamp,
      errorCode: null,
      leaseHash: null,
      leaseExpiresAt: null,
      resumableSession: null,
    })
    await saveJob(redis, next)
    return publicJob(next)
  }

  const errorCode = (input.errorCode || "SMOKY_VOD_UPLOAD_WORKER_FAILED").slice(0, 200)
  const canRetry = Boolean(input.retriable) && job.attempts < MAX_ATTEMPTS
  const nextStatus = input.uncertain ? "uncertain" : canRetry ? "pending" : "failed"
  const next = smokyYouTubeVodUploadJobSchema.parse({
    ...job,
    status: nextStatus,
    updatedAt: timestamp,
    completedAt: nextStatus === "pending" ? null : timestamp,
    errorCode,
    leaseHash: null,
    leaseExpiresAt: null,
    resumableSession: input.sessionExpired ? null : job.resumableSession,
  })
  await saveJob(redis, next)
  return publicJob(next)
}
