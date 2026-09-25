import { createHash, createPublicKey, timingSafeEqual, verify as verifySignature } from "node:crypto"

import { Redis } from "@upstash/redis"
import { z } from "zod"

import { isR2AssetStorageConfigured, presignR2Object } from "@/lib/server/r2-presign"
import { getLatestTwitchMediaQueue } from "@/lib/server/twitch-media-factory"
import { personalizeTwitchCreatorCopy } from "@/lib/server/twitch-creator-copy"

export const TWITCH_SHORT_RENDER_VERSION = "twitch-short-render-v1" as const
const TWITCH_SHORT_RENDER_LAYOUT_VERSION = "safe-text-v3" as const

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
  videoAnalysis: z.object({
    version: z.enum(["twitch-video-analysis-v1", "twitch-video-analysis-v2", "twitch-video-analysis-v3"]),
    analyzedAt: z.string().datetime(),
    model: z.string().min(1).max(200),
    score: z.number().int().min(0).max(100),
    recommendation: z.literal("render"),
    reason: z.string().min(1).max(600),
    bestStartSeconds: z.number().min(0).max(120).nullable(),
    bestEndSeconds: z.number().min(0).max(120).nullable(),
  }).optional(),
  publishMetadata: z.object({
    title: z.string().min(1).max(140),
    description: z.string().min(1).max(5000),
    tags: z.array(z.string().min(1).max(80)).min(3).max(20),
    hashtags: z.array(z.string().min(1).max(80)).min(3).max(12),
    keywords: z.array(z.string().min(1).max(80)).min(3).max(15),
    categoryLabel: z.string().min(1).max(120),
    twitchClipTitle: z.string().min(1).max(100),
    youtube: z.object({
      title: z.string().min(1).max(100),
      description: z.string().min(1).max(5000),
      tags: z.array(z.string().min(1).max(80)).min(3).max(20),
      hashtags: z.array(z.string().min(1).max(80)).min(3).max(12),
    }).strict(),
    tiktok: z.object({
      caption: z.string().min(1).max(2200),
      hashtags: z.array(z.string().min(1).max(80)).min(3).max(12),
    }).strict(),
    instagram: z.object({
      caption: z.string().min(1).max(2200),
      hashtags: z.array(z.string().min(1).max(80)).min(3).max(12),
    }).strict(),
    x: z.object({
      post: z.string().min(1).max(280),
    }).strict(),
  }).strict().optional(),
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

const GITHUB_ACTIONS_OIDC_ISSUER = "https://token.actions.githubusercontent.com"
const GITHUB_ACTIONS_OIDC_JWKS = "https://token.actions.githubusercontent.com/.well-known/jwks"
const GITHUB_ACTIONS_WORKER_AUDIENCE = "ams-twitch-worker"
const GITHUB_ACTIONS_WORKER_REPOSITORY = "Bagelwaffles/aspect-ai-webview-app"
const GITHUB_ACTIONS_WORKER_REPOSITORY_ID = "1026496028"
const GITHUB_ACTIONS_WORKER_WORKFLOW = "Twitch Short Render Worker"
const GITHUB_ACTIONS_WORKER_WORKFLOW_REF =
  "Bagelwaffles/aspect-ai-webview-app/.github/workflows/twitch-short-render-worker.yml@refs/heads/main"

type GitHubActionsWorkerClaims = {
  iss?: unknown
  aud?: unknown
  sub?: unknown
  exp?: unknown
  nbf?: unknown
  iat?: unknown
  repository?: unknown
  repository_id?: unknown
  ref?: unknown
  workflow?: unknown
  workflow_ref?: unknown
  event_name?: unknown
  environment?: unknown
  runner_environment?: unknown
}

type JsonWebKeySet = {
  keys?: Array<JsonWebKey & { kid?: string; alg?: string }>
}

let cachedGitHubJwks: { expiresAt: number; value: JsonWebKeySet } | null = null

function audienceIncludes(value: unknown, expected: string) {
  if (typeof value === "string") return value === expected
  return Array.isArray(value) && value.some((item) => item === expected)
}

export function validateGitHubActionsWorkerClaims(
  claims: GitHubActionsWorkerClaims,
  nowMs = Date.now(),
) {
  const now = Math.floor(nowMs / 1000)
  const exp = typeof claims.exp === "number" ? claims.exp : 0
  const nbf = typeof claims.nbf === "number" ? claims.nbf : 0
  const iat = typeof claims.iat === "number" ? claims.iat : 0

  if (claims.iss !== GITHUB_ACTIONS_OIDC_ISSUER) return false
  if (!audienceIncludes(claims.aud, GITHUB_ACTIONS_WORKER_AUDIENCE)) return false
  if (claims.sub !== `repo:${GITHUB_ACTIONS_WORKER_REPOSITORY}:environment:production`) return false
  if (claims.repository !== GITHUB_ACTIONS_WORKER_REPOSITORY) return false
  if (claims.repository_id !== GITHUB_ACTIONS_WORKER_REPOSITORY_ID) return false
  if (claims.ref !== "refs/heads/main") return false
  if (claims.workflow !== GITHUB_ACTIONS_WORKER_WORKFLOW) return false
  if (claims.workflow_ref !== GITHUB_ACTIONS_WORKER_WORKFLOW_REF) return false
  if (!["schedule", "workflow_dispatch", "push"].includes(String(claims.event_name ?? ""))) return false
  if (claims.environment !== "production") return false
  if (claims.runner_environment !== undefined && claims.runner_environment !== "github-hosted") return false
  if (!exp || exp < now - 30) return false
  if (nbf && nbf > now + 30) return false
  if (!iat || iat > now + 30 || iat < now - 15 * 60) return false
  return true
}

function decodeJwtJson<T>(part: string): T | null {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T
  } catch {
    return null
  }
}

async function githubActionsJwks(fetcher: typeof fetch) {
  const now = Date.now()
  if (cachedGitHubJwks && cachedGitHubJwks.expiresAt > now) return cachedGitHubJwks.value

  const response = await fetcher(GITHUB_ACTIONS_OIDC_JWKS, {
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok) throw new Error("MEDIA_WORKER_OIDC_JWKS_UNAVAILABLE")
  const parsed = await response.json() as JsonWebKeySet
  if (!Array.isArray(parsed.keys) || !parsed.keys.length) {
    throw new Error("MEDIA_WORKER_OIDC_JWKS_INVALID")
  }
  cachedGitHubJwks = { value: parsed, expiresAt: now + 5 * 60 * 1000 }
  return parsed
}

async function verifyGitHubActionsWorkerToken(token: string, fetcher: typeof fetch) {
  if (!token || token.length > 20_000) return false
  const parts = token.split(".")
  if (parts.length !== 3) return false

  const header = decodeJwtJson<{ alg?: unknown; kid?: unknown; typ?: unknown }>(parts[0])
  const claims = decodeJwtJson<GitHubActionsWorkerClaims>(parts[1])
  if (!header || !claims) return false
  if (header.alg !== "RS256" || typeof header.kid !== "string") return false
  if (header.typ !== undefined && header.typ !== "JWT") return false
  if (!validateGitHubActionsWorkerClaims(claims)) return false

  const jwks = await githubActionsJwks(fetcher)
  const jwk = jwks.keys?.find((candidate) =>
    candidate.kid === header.kid &&
    candidate.kty === "RSA" &&
    (candidate.alg === undefined || candidate.alg === "RS256"),
  )
  if (!jwk) return false

  const key = createPublicKey({
    key: jwk as unknown as Record<string, string>,
    format: "jwk",
  })
  const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  const signature = Uint8Array.from(Buffer.from(parts[2], "base64url"))
  return verifySignature("RSA-SHA256", signingInput, key, signature)
}

export async function authorizeMediaWorker(
  authorization: string | null,
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
) {
  if (!authorization?.startsWith("Bearer ")) return false
  const supplied = authorization.slice("Bearer ".length).trim()
  if (!supplied) return false

  const secret = workerSecret(env)
  if (secret) {
    const left = Uint8Array.from(createHash("sha256").update(supplied).digest())
    const right = Uint8Array.from(createHash("sha256").update(secret).digest())
    if (timingSafeEqual(left, right)) return true
  }

  try {
    return await verifyGitHubActionsWorkerToken(supplied, fetcher)
  } catch {
    return false
  }
}

function safeSegment(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 180)
}

function personalizePublishMetadata(
  metadata: NonNullable<TwitchShortRenderJob["publishMetadata"]>,
  creatorName: string,
) {
  return {
    ...metadata,
    title: personalizeTwitchCreatorCopy(metadata.title, creatorName),
    description: personalizeTwitchCreatorCopy(metadata.description, creatorName),
    tags: metadata.tags.map((value) => personalizeTwitchCreatorCopy(value, creatorName)),
    keywords: metadata.keywords.map((value) => personalizeTwitchCreatorCopy(value, creatorName)),
    twitchClipTitle: personalizeTwitchCreatorCopy(metadata.twitchClipTitle, creatorName),
    youtube: {
      ...metadata.youtube,
      title: personalizeTwitchCreatorCopy(metadata.youtube.title, creatorName),
      description: personalizeTwitchCreatorCopy(metadata.youtube.description, creatorName),
      tags: metadata.youtube.tags.map((value) => personalizeTwitchCreatorCopy(value, creatorName)),
    },
    tiktok: {
      ...metadata.tiktok,
      caption: personalizeTwitchCreatorCopy(metadata.tiktok.caption, creatorName),
    },
    instagram: {
      ...metadata.instagram,
      caption: personalizeTwitchCreatorCopy(metadata.instagram.caption, creatorName),
    },
    x: {
      ...metadata.x,
      post: personalizeTwitchCreatorCopy(metadata.x.post, creatorName),
    },
  }
}

function hasGenericStreamerCopy(job: TwitchShortRenderJob) {
  const values = [
    job.shortDraft.title,
    job.shortDraft.hook,
    job.shortDraft.caption,
    job.publishMetadata?.title,
    job.publishMetadata?.description,
    job.publishMetadata?.youtube.title,
    job.publishMetadata?.youtube.description,
  ].filter((value): value is string => Boolean(value))
  return values.some((value) => /\bstreamer(?:'s|’s)?\b/i.test(value))
}

function creatorNameForLegacyJob(job: TwitchShortRenderJob, fallback: string) {
  const descriptionMatch = job.publishMetadata?.description.match(/Actual Twitch footage from ([A-Za-z0-9_]+)/i)?.[1]
  if (descriptionMatch) return descriptionMatch

  const reserved = new Set(["gaming", "twitch", "shorts"])
  const hashtagName = job.publishMetadata?.hashtags
    .map((value) => value.replace(/^#/, ""))
    .find((value) => value && !reserved.has(value.toLowerCase()))
  return hashtagName || fallback
}

function jobId(streamId: string, clipId: string) {
  return createHash("sha256")
    .update(`${streamId}:${clipId}:short-v1:${TWITCH_SHORT_RENDER_LAYOUT_VERSION}`)
    .digest("hex")
    .slice(0, 32)
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

  if (!item.videoAnalysis) {
    throw new Error("TWITCH_VIDEO_ANALYSIS_REQUIRED")
  }
  if (item.videoAnalysis.recommendation !== "render" || item.videoAnalysis.score < 65) {
    throw new Error("TWITCH_VIDEO_ANALYSIS_REJECTED")
  }
  if (!item.videoAnalysis.publishMetadata) {
    throw new Error("TWITCH_VIDEO_METADATA_REQUIRED")
  }

  const timestamp = nowIso(options)
  const creatorName = item.creatorName || queue.broadcasterLogin
  const personalizedPublishMetadata = personalizePublishMetadata(
    item.videoAnalysis.publishMetadata,
    creatorName,
  )
  const outputObjectKey = [
    "creators",
    "twitch",
    safeSegment(queue.broadcasterId),
    safeSegment(queue.streamId),
    "shorts",
    `${safeSegment(item.clipId)}-${TWITCH_SHORT_RENDER_LAYOUT_VERSION}.mp4`,
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
    shortDraft: {
      ...item.shortDraft,
      title: personalizeTwitchCreatorCopy(item.shortDraft.title, creatorName),
      hook: personalizeTwitchCreatorCopy(item.shortDraft.hook, creatorName),
      caption: personalizeTwitchCreatorCopy(item.shortDraft.caption, creatorName),
    },
    videoAnalysis: {
      version: item.videoAnalysis.version,
      analyzedAt: item.videoAnalysis.analyzedAt,
      model: item.videoAnalysis.model,
      score: item.videoAnalysis.score,
      recommendation: "render",
      reason: personalizeTwitchCreatorCopy(item.videoAnalysis.reason, creatorName),
      bestStartSeconds: item.videoAnalysis.bestStartSeconds,
      bestEndSeconds: item.videoAnalysis.bestEndSeconds,
    },
    publishMetadata: personalizedPublishMetadata,
  })
  const index = await loadIndex(redis)
  await Promise.all([
    saveJob(job, redis),
    saveIndex([job.jobId, ...index.filter((value) => value !== job.jobId)], redis),
  ])
  return job
}

export async function requeueGenericCreatorTwitchShortRenders(
  options: Options = {},
) {
  const env = options.env ?? process.env
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("TWITCH_SHORT_RENDER_STORE_UNAVAILABLE")
  if (!isTwitchShortRenderConfigured(env)) throw new Error("TWITCH_SHORT_RENDER_NOT_CONFIGURED")

  const queue = await getLatestTwitchMediaQueue({ env, redis })
  const fallbackCreatorName = queue?.broadcasterLogin || "Creator"
  const jobs = await listLatestTwitchShortRenderJobs({ ...options, redis })
  let index = await loadIndex(redis)
  let requeued = 0

  for (const legacy of jobs) {
    if (requeued >= 3) break
    if (legacy.status !== "rendered") continue
    if (legacy.outputObjectKey.endsWith(`-${TWITCH_SHORT_RENDER_LAYOUT_VERSION}.mp4`)) continue
    if (!legacy.publishMetadata || !hasGenericStreamerCopy(legacy)) continue

    const id = jobId(legacy.streamId, legacy.clipId)
    const creatorName = creatorNameForLegacyJob(legacy, fallbackCreatorName)
    const desiredShortDraft = {
      ...legacy.shortDraft,
      title: personalizeTwitchCreatorCopy(legacy.shortDraft.title, creatorName),
      hook: personalizeTwitchCreatorCopy(legacy.shortDraft.hook, creatorName),
      caption: personalizeTwitchCreatorCopy(legacy.shortDraft.caption, creatorName),
    }
    const desiredPublishMetadata = personalizePublishMetadata(legacy.publishMetadata, creatorName)
    const existing = await getTwitchShortRenderJob(id, { ...options, redis })
    if (existing?.status === "pending" || existing?.status === "rendering") continue
    if (
      existing?.status === "rendered" &&
      existing.shortDraft.title === desiredShortDraft.title &&
      existing.shortDraft.hook === desiredShortDraft.hook &&
      existing.shortDraft.caption === desiredShortDraft.caption &&
      existing.publishMetadata?.title === desiredPublishMetadata.title &&
      existing.publishMetadata?.description === desiredPublishMetadata.description
    ) continue

    const timestamp = nowIso(options)
    const outputObjectKey = [
      "creators",
      "twitch",
      safeSegment(legacy.broadcasterId),
      safeSegment(legacy.streamId),
      "shorts",
      `${safeSegment(legacy.clipId)}-${TWITCH_SHORT_RENDER_LAYOUT_VERSION}.mp4`,
    ].join("/")

    const next = twitchShortRenderJobSchema.parse({
      ...legacy,
      jobId: id,
      outputObjectKey,
      status: "pending",
      attempts: existing?.attempts ?? 0,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      claimedAt: null,
      completedAt: null,
      errorCode: null,
      shortDraft: desiredShortDraft,
      videoAnalysis: legacy.videoAnalysis
        ? {
            ...legacy.videoAnalysis,
            reason: personalizeTwitchCreatorCopy(legacy.videoAnalysis.reason, creatorName),
          }
        : undefined,
      publishMetadata: desiredPublishMetadata,
    })

    await saveJob(next, redis)
    index = [next.jobId, ...index.filter((value) => value !== next.jobId)]
    requeued += 1
  }

  if (requeued) await saveIndex(index, redis)
  return requeued
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
