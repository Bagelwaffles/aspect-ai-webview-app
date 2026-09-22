import { Redis } from "@upstash/redis"
import { z } from "zod"

import { CUSTOMER_ASSET_MAX_BYTES } from "@/lib/server/asset-policy"
import { presignR2Object } from "@/lib/server/r2-presign"
import {
  getLatestStreamIntelligencePackage,
  regenerateLatestStreamIntelligencePackage,
  type StreamIntelligencePackage,
} from "@/lib/server/stream-intelligence"
import {
  getTwitchClipDownloadUrls,
  getTwitchPilotStatus,
  refreshTwitchPostStreamSummary,
  twitchMediaScopeEnabled,
  type TwitchPilotSummary,
  type TwitchRecentClip,
} from "@/lib/server/twitch-pilot"

export const TWITCH_MEDIA_FACTORY_VERSION = "twitch-media-factory-v1" as const

const QUEUE_KEY_PREFIX = "ams:twitch-media:v1:queue:"
const LATEST_QUEUE_KEY = "ams:twitch-media:v1:latest"
const QUEUE_TTL_SECONDS = 60 * 60 * 24 * 180

export const twitchVideoAnalysisRecordSchema = z.object({
  version: z.enum(["twitch-video-analysis-v1", "twitch-video-analysis-v2"]),
  clipId: z.string().min(1).max(160),
  analyzedAt: z.string().datetime(),
  model: z.string().min(1).max(200),
  score: z.number().int().min(0).max(100),
  recommendation: z.enum(["render", "skip"]),
  reason: z.string().min(1).max(600),
  observedMoments: z.array(z.string().min(1).max(240)).max(6),
  bestStartSeconds: z.number().min(0).max(120).nullable(),
  bestEndSeconds: z.number().min(0).max(120).nullable(),
  hook: z.string().min(1).max(180),
  caption: z.string().min(1).max(1000),
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
  evidenceBoundary: z.string().min(1).max(500),
}).strict()

export type TwitchVideoAnalysisRecord = z.infer<typeof twitchVideoAnalysisRecordSchema>

const itemSchema = z.object({
  clipId: z.string().min(1).max(160),
  title: z.string().max(500),
  twitchUrl: z.string().url(),
  creatorName: z.string().max(120),
  createdAt: z.string(),
  duration: z.number().min(0).max(120).nullable(),
  vodOffset: z.number().int().min(0).nullable(),
  videoId: z.string().max(160),
  thumbnailUrl: z.string().max(2000),
  status: z.enum(["discovered", "short-ready", "landscape-ready"]),
  orientation: z.enum(["portrait", "landscape"]).nullable(),
  objectKey: z.string().max(1000).nullable(),
  importedAt: z.string().datetime().nullable(),
  videoAnalysis: twitchVideoAnalysisRecordSchema.nullable().optional(),
  shortDraft: z.object({
    title: z.string().min(1).max(140),
    hook: z.string().min(1).max(180),
    caption: z.string().min(1).max(1000),
    hashtags: z.array(z.string().min(1).max(80)).max(12),
  }).strict(),
}).strict()

export const twitchMediaQueueSchema = z.object({
  version: z.literal(TWITCH_MEDIA_FACTORY_VERSION),
  streamId: z.string().min(1).max(120),
  broadcasterId: z.string().min(1).max(120),
  broadcasterLogin: z.string().min(1).max(120),
  generatedAt: z.string().datetime(),
  mediaAuthorized: z.boolean(),
  items: z.array(itemSchema).max(100),
}).strict()

export type TwitchMediaQueue = z.infer<typeof twitchMediaQueueSchema>
export type TwitchMediaQueueItem = z.infer<typeof itemSchema>

export function isMp4FileSignature(bytes: Uint8Array) {
  return bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
}

export async function readTwitchMediaBody(
  stream: ReadableStream<Uint8Array>,
  maxBytes = CUSTOMER_ASSET_MAX_BYTES,
) {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (!value?.length) continue
      total += value.length
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw new Error("TWITCH_MEDIA_SOURCE_TOO_LARGE")
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.length
  }
  return body
}

function safeNetworkFailureCode(error: unknown) {
  const cause = error instanceof Error
    ? (error.cause as { code?: unknown } | undefined)
    : undefined
  const code = typeof cause?.code === "string" ? cause.code : ""

  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "DNS"
  if (code === "UND_ERR_CONNECT_TIMEOUT" || code === "ETIMEDOUT") return "TIMEOUT"
  if (code === "ECONNRESET" || code === "EPIPE") return "RESET"
  if (code.startsWith("ERR_TLS") || code.startsWith("CERT_")) return "TLS"
  if (error instanceof DOMException && error.name === "TimeoutError") return "TIMEOUT"
  if (error instanceof DOMException && error.name === "AbortError") return "ABORTED"
  return "UNKNOWN"
}

export function reconcileTwitchMediaAuthorization(
  queue: TwitchMediaQueue | null,
  scopes?: string[],
): TwitchMediaQueue | null {
  if (!queue) return null
  return twitchMediaQueueSchema.parse({
    ...queue,
    mediaAuthorized: twitchMediaScopeEnabled(scopes),
  })
}

type Options = {
  env?: NodeJS.ProcessEnv
  redis?: Redis | null
  fetcher?: typeof fetch
  now?: () => Date
  getStatus?: () => Promise<{
    connection?: { scopes?: string[] } | null
    session?: { streamId?: string; broadcasterId?: string; broadcasterLogin?: string } | null
    summary?: TwitchPilotSummary | null
  }>
  getIntelligence?: () => Promise<StreamIntelligencePackage | null>
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

function parseQueue(raw: unknown): TwitchMediaQueue | null {
  if (!raw) return null
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw
    const parsed = twitchMediaQueueSchema.safeParse(value)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function itemDraft(
  index: number,
  clip: TwitchPilotSummary["clips"][number],
  intelligence: StreamIntelligencePackage | null,
) {
  const short = intelligence?.draft.shortForm
  const title = (clip.title || intelligence?.draft.youtube.titleOptions[index % (intelligence?.draft.youtube.titleOptions.length || 1)] || "Gaming highlight").slice(0, 140)
  const hook = short?.hooks[index % short.hooks.length] || clip.title || "Gaming highlight"
  const caption = short?.captions[index % short.captions.length] || `${clip.title || "Gaming highlight"} — review before publishing.`
  return {
    title,
    hook: hook.slice(0, 180),
    caption: caption.slice(0, 1000),
    hashtags: (short?.hashtags ?? ["#gaming", "#twitch", "#shorts"]).slice(0, 12),
  }
}

export function buildTwitchMediaQueue(input: {
  summary: TwitchPilotSummary
  intelligence: StreamIntelligencePackage | null
  broadcasterId: string
  broadcasterLogin: string
  scopes?: string[]
  previous?: TwitchMediaQueue | null
  generatedAt?: string
}): TwitchMediaQueue {
  const previousByClip = new Map((input.previous?.items ?? []).map((item) => [item.clipId, item]))
  return twitchMediaQueueSchema.parse({
    version: TWITCH_MEDIA_FACTORY_VERSION,
    streamId: input.summary.streamId,
    broadcasterId: input.broadcasterId,
    broadcasterLogin: input.broadcasterLogin,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    mediaAuthorized: twitchMediaScopeEnabled(input.scopes),
    items: input.summary.clips.map((clip, index) => {
      const previous = previousByClip.get(clip.id)
      return {
        clipId: clip.id,
        title: clip.title,
        twitchUrl: clip.url,
        creatorName: clip.creatorName,
        createdAt: clip.createdAt,
        duration: typeof clip.duration === "number" && clip.duration > 0 ? clip.duration : null,
        vodOffset: typeof clip.vodOffset === "number" ? clip.vodOffset : null,
        videoId: clip.videoId ?? "",
        thumbnailUrl: clip.thumbnailUrl ?? "",
        status: previous?.status ?? "discovered",
        orientation: previous?.orientation ?? null,
        objectKey: previous?.objectKey ?? null,
        importedAt: previous?.importedAt ?? null,
        videoAnalysis: previous?.videoAnalysis ?? null,
        shortDraft: previous?.videoAnalysis?.recommendation === "render" && previous.videoAnalysis.publishMetadata
          ? {
              ...itemDraft(index, clip, input.intelligence),
              title: previous.videoAnalysis.publishMetadata.title,
              hook: previous.videoAnalysis.hook,
              caption: previous.videoAnalysis.caption,
              hashtags: previous.videoAnalysis.publishMetadata.hashtags,
            }
          : itemDraft(index, clip, input.intelligence),
      }
    }),
  })
}

async function saveQueue(queue: TwitchMediaQueue, redis: Redis) {
  const serialized = JSON.stringify(twitchMediaQueueSchema.parse(queue))
  await Promise.all([
    redis.set(`${QUEUE_KEY_PREFIX}${queue.streamId}`, serialized, { ex: QUEUE_TTL_SECONDS }),
    redis.set(LATEST_QUEUE_KEY, serialized, { ex: QUEUE_TTL_SECONDS }),
  ])
}

export async function getLatestTwitchMediaQueue(options: Options = {}) {
  const redis = runtimeRedis(options)
  if (!redis) return null
  return parseQueue(await redis.get<unknown>(LATEST_QUEUE_KEY))
}

export async function saveTwitchMediaVideoAnalysis(
  clipId: string,
  analysis: TwitchVideoAnalysisRecord,
  options: Options = {},
) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("TWITCH_MEDIA_STORE_UNAVAILABLE")
  const queue = await getLatestTwitchMediaQueue({ ...options, redis })
  if (!queue) throw new Error("TWITCH_MEDIA_QUEUE_NOT_FOUND")
  const existing = queue.items.find((candidate) => candidate.clipId === clipId)
  if (!existing) throw new Error("TWITCH_MEDIA_CLIP_NOT_FOUND")

  const parsedAnalysis = twitchVideoAnalysisRecordSchema.parse(analysis)
  if (parsedAnalysis.clipId !== clipId) throw new Error("TWITCH_VIDEO_ANALYSIS_CLIP_MISMATCH")

  const next = twitchMediaQueueSchema.parse({
    ...queue,
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    items: queue.items.map((candidate) => candidate.clipId === clipId
      ? {
          ...candidate,
          videoAnalysis: parsedAnalysis,
          shortDraft: parsedAnalysis.recommendation === "render" && parsedAnalysis.publishMetadata
            ? {
                ...candidate.shortDraft,
                title: parsedAnalysis.publishMetadata.title,
                hook: parsedAnalysis.hook,
                caption: parsedAnalysis.caption,
                hashtags: parsedAnalysis.publishMetadata.hashtags,
              }
            : candidate.shortDraft,
        }
      : candidate),
  })

  await saveQueue(next, redis)
  return next.items.find((candidate) => candidate.clipId === clipId)!
}

export async function syncLatestTwitchMediaQueue(options: Options = {}) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("TWITCH_MEDIA_STORE_UNAVAILABLE")
  const status = options.getStatus ? await options.getStatus() : await getTwitchPilotStatus({ env: options.env, redis })
  const summary = (status.summary ?? null) as TwitchPilotSummary | null
  const session = (status.session ?? null) as {
    streamId?: string
    broadcasterId?: string
    broadcasterLogin?: string
  } | null
  if (!summary || !session?.streamId || summary.streamId !== session.streamId) {
    throw new Error("TWITCH_MEDIA_SUMMARY_REQUIRED")
  }
  const intelligence = options.getIntelligence
    ? await options.getIntelligence()
    : await getLatestStreamIntelligencePackage({ env: options.env, redis })
  const previous = await getLatestTwitchMediaQueue({ ...options, redis })
  const queue = buildTwitchMediaQueue({
    summary,
    intelligence: intelligence?.streamId === summary.streamId ? intelligence : null,
    broadcasterId: session.broadcasterId ?? summary.broadcasterId,
    broadcasterLogin: session.broadcasterLogin ?? summary.broadcasterLogin,
    scopes: (status.connection as { scopes?: string[] } | null | undefined)?.scopes,
    previous: previous?.streamId === summary.streamId ? previous : null,
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
  })
  await saveQueue(queue, redis)
  return queue
}

export async function syncTwitchDailyMediaQueue(input: {
  dayKey: string
  broadcasterId: string
  broadcasterLogin: string
  scopes?: string[]
  clips: TwitchRecentClip[]
  generatedAt?: string
}, options: Options = {}) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("TWITCH_MEDIA_STORE_UNAVAILABLE")

  const previous = await getLatestTwitchMediaQueue({ ...options, redis })
  const generatedAt = input.generatedAt ?? (options.now ?? (() => new Date()))().toISOString()
  const summary: TwitchPilotSummary = {
    broadcasterId: input.broadcasterId,
    broadcasterLogin: input.broadcasterLogin,
    broadcasterName: input.broadcasterLogin,
    streamId: input.dayKey,
    startedAt: generatedAt,
    endedAt: generatedAt,
    durationMinutes: 0,
    title: "Daily Twitch archive",
    categoryName: "Gaming",
    vod: null,
    markers: [],
    clips: input.clips,
    updateCount: 0,
    summary: `Daily Twitch media queue containing ${input.clips.length} clip candidate${input.clips.length === 1 ? "" : "s"} across the rolling archive window.`,
    generatedAt,
    sourceModel: "twitch-metadata",
  }

  const queue = buildTwitchMediaQueue({
    summary,
    intelligence: null,
    broadcasterId: input.broadcasterId,
    broadcasterLogin: input.broadcasterLogin,
    scopes: input.scopes,
    previous: previous?.streamId === input.dayKey ? previous : null,
    generatedAt,
  })
  await saveQueue(queue, redis)
  return queue
}

export async function refreshLatestTwitchMediaQueue(options: Options = {}) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("TWITCH_MEDIA_STORE_UNAVAILABLE")
  await refreshTwitchPostStreamSummary({ env: options.env, redis }).catch(() => null)
  await regenerateLatestStreamIntelligencePackage({ env: options.env, redis }).catch(() => null)
  return syncLatestTwitchMediaQueue({ ...options, redis })
}

function safeSegment(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 180)
}

export async function importTwitchClipMedia(clipId: string, options: Options = {}) {
  const env = options.env ?? process.env
  const redis = runtimeRedis(options)
  const fetcher = options.fetcher ?? fetch
  if (!redis) throw new Error("TWITCH_MEDIA_STORE_UNAVAILABLE")
  const queue = await getLatestTwitchMediaQueue({ ...options, redis })
  if (!queue) throw new Error("TWITCH_MEDIA_QUEUE_NOT_FOUND")
  const item = queue.items.find((candidate) => candidate.clipId === clipId)
  if (!item) throw new Error("TWITCH_MEDIA_CLIP_NOT_FOUND")

  const downloads = await getTwitchClipDownloadUrls([clipId], { env, redis, fetcher })
  const download = downloads.find((candidate) => candidate.clipId === clipId)
  const sourceUrl = download?.portraitUrl ?? download?.landscapeUrl
  const orientation = download?.portraitUrl ? "portrait" : download?.landscapeUrl ? "landscape" : null
  if (!sourceUrl || !orientation) throw new Error("TWITCH_MEDIA_DOWNLOAD_UNAVAILABLE")

  let source: Response
  try {
    source = await fetcher(sourceUrl, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error) {
    throw new Error(`TWITCH_MEDIA_SOURCE_NETWORK_FAILED:${safeNetworkFailureCode(error)}`)
  }
  if (!source.ok || !source.body) throw new Error("TWITCH_MEDIA_SOURCE_FETCH_FAILED")
  const size = Number(source.headers.get("content-length") ?? "")
  if (Number.isFinite(size) && size > CUSTOMER_ASSET_MAX_BYTES) {
    throw new Error("TWITCH_MEDIA_SOURCE_TOO_LARGE")
  }
  const mediaBody = await readTwitchMediaBody(source.body)
  if (!isMp4FileSignature(mediaBody)) throw new Error("TWITCH_MEDIA_SOURCE_TYPE_INVALID")
  const contentType = "video/mp4"

  const objectKey = [
    "creators",
    "twitch",
    safeSegment(queue.broadcasterId),
    safeSegment(queue.streamId),
    "clips",
    safeSegment(clipId),
    `${orientation}.mp4`,
  ].join("/")
  const signed = presignR2Object("PUT", objectKey, {
    contentType,
    expiresInSeconds: 300,
  }, env)

  const putInit: RequestInit = {
    method: "PUT",
    headers: signed.requiredHeaders as Record<string, string>,
    body: new Blob([mediaBody], { type: contentType }),
    signal: AbortSignal.timeout(60_000),
  }
  let stored: Response
  try {
    stored = await fetcher(signed.url, putInit)
  } catch (error) {
    throw new Error(`TWITCH_MEDIA_STORE_NETWORK_FAILED:${safeNetworkFailureCode(error)}`)
  }
  if (!stored.ok) throw new Error(`TWITCH_MEDIA_STORE_WRITE_FAILED:${stored.status}`)

  const now = (options.now ?? (() => new Date()))().toISOString()
  const next: TwitchMediaQueue = twitchMediaQueueSchema.parse({
    ...queue,
    generatedAt: now,
    items: queue.items.map((candidate) => candidate.clipId === clipId
      ? {
          ...candidate,
          status: orientation === "portrait" ? "short-ready" : "landscape-ready",
          orientation,
          objectKey,
          importedAt: now,
        }
      : candidate),
  })
  await saveQueue(next, redis)

  const preview = presignR2Object("GET", objectKey, { expiresInSeconds: 600 }, env)
  return {
    queue: next,
    item: next.items.find((candidate) => candidate.clipId === clipId)!,
    previewUrl: preview.url,
  }
}
