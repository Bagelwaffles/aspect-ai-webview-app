import { createHash, timingSafeEqual } from "node:crypto"

import { Redis } from "@upstash/redis"
import { z } from "zod"

import { isR2AssetStorageConfigured, presignR2Object } from "@/lib/server/r2-presign"
import { getLatestTwitchMediaQueue } from "@/lib/server/twitch-media-factory"

export const TWITCH_SHORT_RENDER_VERSION = "twitch-short-render-v1" as const

const JOB_KEY_PREFIX = "ams:twitch-short-render:v1:job:"
const JOB_INDEX_KEY = "ams:twitch-short-render:v1:index"
const JOB_TTL_SECONDS = 60 * 60 * 24 * 180
const MAX_INDEX_JOBS = 100

const shortDraftSchema = z.object({
  title: z.string().min(1).max(140),
  hook: z.string().min(1).max(180),
  caption: z.string().min(1).max(1000),
  hashtags: z.array(z.string().min(1).max(80)).max(12),
}).strict()

export const twitchShortRenderJobSchema = z.object({
  version: z.literal(TWITCH_SHORT_RENDER_VERSION),
  jobId: z.string().min(1).max(200),
  streamId: z.string().min(1).max(120),
  broadcasterId: z.string().min(1).max(120),
  clipId: z.string().min(1).max(160),
  sourceObjectKey: z.string().min(1).max(1000),
  outputObjectKey: z.string().min(1).max(1000),
  status: z.enum(["pending", "rendering", "rendered", "failed"]),
  attempts: z.number().int().min(0).max(10),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  claimedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  errorCode: z.string().max(200).nullable(),
  shortDraft: shortDraftSchema,
}).strict()

export type TwitchShortRenderJob = z.infer<typeof twitchShortRenderJobSchema>

type Options = {
  env?: NodeJS.ProcessEnv
  redis?: Redis | null
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

function nowIso(options: Options) {
  return (options.now ?? (() => new Date()))().toISOString()
}

function parseJob(raw: unknown): TwitchShortRenderJob | null {
  if (!raw) return null
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw
    const parsed = twitchShortRenderJobSchema.safeParse(value)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function renderEnabled(env: NodeJS.ProcessEnv) {
  return clean(env.AMS_TWITCH_SHORT_RENDER_ENABLED)?.toLowerCase() === "true"
}

function workerSecret(env: NodeJS.ProcessEnv) {
  const value = clean(env.AMS_MEDIA_WORKER_KEY)
  return value && value.length >= 32 ? value : null
}

export function isTwitchShortRenderConfigured(env: NodeJS.ProcessEnv = process.env) {
  return renderEnabled(env) && Boolean(workerSecret(env)) && Boolean(resolveRedis(env)) && isR2AssetStorageConfigured(env)
}

export function authorizeMediaWorker(
  authorization: string | null,
  env: NodeJS.ProcessEnv = process.env,
) {
  const secret = workerSecret(env)
  if (!secret || !authorization?.startsWith("Bearer ")) return false
  const supplied = authorization.slice("Bearer ".length).trim()
  const left = Buffer.from(createHash("sha256").update(supplied).digest())
  const right = Buffer.from(createHash("sha256").update(secret).digest())
  return timingSafeEqual(left, right)
}

function safeSegment(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 180)
}

function jobId(streamId: string, clipId: string) {
  return createHash("sha256").update(`${streamId}:${clipId}:short-v1`).digest("hex").slice(0, 32)
}

async function saveJob(job: TwitchShortRenderJob, redis: Redis) {
  const parsed = twitchShortRenderJobSchema.parse(job)
  await redis.set(`${JOB_KEY_PREFIX}${parsed.jobId}`, JSON.stringify(parsed), { ex: JOB_TTL_SECONDS })
}

async function loadIndex(redis: Redis) {
  const raw = await redis.get<unknown>(JOB_INDEX_KEY)
  if (!raw) return [] as string[]
  if (Array.isArray(raw)) return raw.filter((item): item is string => typeof item === "string").slice(0, MAX_INDEX_JOBS)
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, MAX_INDEX_JOBS) : []
    } catch {
      return []
    }
  }
  return []
}

async function saveIndex(ids: string[], redis: Redis) {
  await redis.set(JOB_INDEX_KEY, JSON.stringify(ids.slice(0, MAX_INDEX_JOBS)), { ex: JOB_TTL_SECONDS })
}

export async function getTwitchShortRenderJob(id: string, options: Options = {}) {
  const redis = runtimeRedis(options)
  if (!redis) return null
  return parseJob(await redis.get<unknown>(`${JOB_KEY_PREFIX}${id}`))
}

export async function listLatestTwitchShortRenderJobs(options: Options = {}) {
  const redis = runtimeRedis(options)
  if (!redis) return []
  const ids = await loadIndex(redis)
  const jobs = await Promise.all(ids.map((id) => getTwitchShortRenderJob(id, { ...options, redis })))
  return jobs.filter((job): job is TwitchShortRenderJob => Boolean(job))
}

export async function enqueueTwitchShortRender(
  clipId: string,
  options: Options = {},
) {
  const env = options.env ?? process.env
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("TWITCH_SHORT_RENDER_STORE_UNAVAILABLE")
  if (!isTwitchShortRenderConfigured(env)) throw new Error("TWITCH_SHORT_RENDER_NOT_CONFIGURED")

  const queue = await getLatestTwitchMediaQueue({ env, redis })
  if (!queue) throw new Error("TWITCH_MEDIA_QUEUE_NOT_FOUND")
  const item = queue.items.find((candidate) => candidate.clipId === clipId)
  if (!item) throw new Error("TWITCH_MEDIA_CLIP_NOT_FOUND")
  if (!item.objectKey || !item.importedAt || item.status === "discovered") {
    throw new Error("TWITCH_MEDIA_IMPORT_REQUIRED")
  }

  const id = jobId(queue.streamId, item.clipId)
  const existing = await getTwitchShortRenderJob(id, { ...options, redis })
  if (existing && existing.status !== "failed") return existing

  const timestamp = nowIso(options)
  const outputObjectKey = [
    "creators",
    "twitch",
    safeSegment(queue.broadcasterId),
    safeSegment(queue.streamId),
    "shorts",
    `${safeSegment(item.clipId)}.mp4`,
  ].join("/")

  const job = twitchShortRenderJobSchema.parse({
    version: TWITCH_SHORT_RENDER_VERSION,
    jobId: id,
    streamId: queue.streamId,
    broadcasterId: queue.broadcasterId,
    clipId: item.clipId,
    sourceObjectKey: item.objectKey,
    outputObjectKey,
    status: "pending",
    attempts: existing?.attempts ?? 0,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    claimedAt: null,
    completedAt: null,
    errorCode: null,
    shortDraft: item.shortDraft,
  })
  const index = await loadIndex(redis)
  await Promise.all([
    saveJob(job, redis),
    saveIndex([job.jobId, ...index.filter((value) => value !== job.jobId)], redis),
  ])
  return job
}

export async function claimNextTwitchShortRenderJob(options: Options = {}) {
  const env = options.env ?? process.env
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("TWITCH_SHORT_RENDER_STORE_UNAVAILABLE")
  if (!isTwitchShortRenderConfigured(env)) throw new Error("TWITCH_SHORT_RENDER_NOT_CONFIGURED")

  const ids = await loadIndex(redis)
  for (const id of ids) {
    const job = await getTwitchShortRenderJob(id, { ...options, redis })
    if (!job || job.status !== "pending" || job.attempts >= 3) continue

    const timestamp = nowIso(options)
    const claimed = twitchShortRenderJobSchema.parse({
      ...job,
      status: "rendering",
      attempts: job.attempts + 1,
      updatedAt: timestamp,
      claimedAt: timestamp,
      errorCode: null,
    })
    await saveJob(claimed, redis)

    const source = presignR2Object("GET", claimed.sourceObjectKey, { expiresInSeconds: 900 }, env)
    const output = presignR2Object("PUT", claimed.outputObjectKey, {
      contentType: "video/mp4",
      expiresInSeconds: 900,
    }, env)

    return {
      job: claimed,
      source: { url: source.url },
      output: { url: output.url, requiredHeaders: output.requiredHeaders },
    }
  }
  return null
}

export async function completeTwitchShortRenderJob(
  input: { jobId: string; ok: boolean; errorCode?: string | null },
  options: Options = {},
) {
  const env = options.env ?? process.env
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("TWITCH_SHORT_RENDER_STORE_UNAVAILABLE")
  const job = await getTwitchShortRenderJob(input.jobId, { ...options, redis })
  if (!job) throw new Error("TWITCH_SHORT_RENDER_JOB_NOT_FOUND")
  if (job.status !== "rendering") throw new Error("TWITCH_SHORT_RENDER_JOB_NOT_CLAIMED")

  const timestamp = nowIso(options)
  if (input.ok) {
    const head = presignR2Object("HEAD", job.outputObjectKey, { expiresInSeconds: 120 }, env)
    const response = await fetch(head.url, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error("TWITCH_SHORT_RENDER_OUTPUT_MISSING")
  }

  const next = twitchShortRenderJobSchema.parse({
    ...job,
    status: input.ok ? "rendered" : "failed",
    updatedAt: timestamp,
    completedAt: timestamp,
    errorCode: input.ok ? null : (input.errorCode || "TWITCH_SHORT_RENDER_WORKER_FAILED").slice(0, 200),
  })
  await saveJob(next, redis)
  return next
}

export async function getRenderedShortPreview(
  jobIdValue: string,
  options: Options = {},
) {
  const env = options.env ?? process.env
  const job = await getTwitchShortRenderJob(jobIdValue, options)
  if (!job || job.status !== "rendered") return null
  const signed = presignR2Object("GET", job.outputObjectKey, { expiresInSeconds: 600 }, env)
  return { job, previewUrl: signed.url }
}
