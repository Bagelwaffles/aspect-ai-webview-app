import { randomUUID } from "node:crypto"

import { z } from "zod"

const DEFAULT_ALLOWED_SOURCE_HOSTS = [
  "files2.heygen.ai",
  "resource2.heygen.ai",
  "dynamic.heygen.ai",
] as const

const youtubePrivacySchema = z.enum(["private", "unlisted", "public"])

export const youtubePublishInputSchema = z
  .object({
    videoUrl: z.string().url().max(4096),
    thumbnailUrl: z.string().url().max(4096).optional(),
    title: z.string().trim().min(1).max(100),
    description: z.string().max(5000).default(""),
    tags: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
    privacyStatus: youtubePrivacySchema.default("private"),
    categoryId: z.string().regex(/^\d+$/).default("28"),
    madeForKids: z.boolean().default(false),
    notifySubscribers: z.boolean().default(false),
  })
  .strict()

export type YouTubePublishInput = z.infer<typeof youtubePublishInputSchema>

export type YouTubePublishResult = {
  ok: boolean
  request_id: string
  status: "accepted" | "published" | "failed"
  video_id?: string
  youtube_url?: string
  privacy_status?: "private" | "unlisted" | "public"
  thumbnail_set?: boolean
  error?: {
    code: string
    message: string
  }
}

export class YouTubePublisherError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 500,
  ) {
    super(message)
    this.name = "YouTubePublisherError"
  }
}

function allowedHosts(): Set<string> {
  const configured = process.env.AMS_YOUTUBE_SOURCE_HOSTS
    ?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)

  return new Set(configured?.length ? configured : DEFAULT_ALLOWED_SOURCE_HOSTS)
}

export function isAllowedYouTubeSourceUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:") return false
    if (url.username || url.password) return false
    if (!allowedHosts().has(url.hostname.toLowerCase())) return false
    return true
  } catch {
    return false
  }
}

export function parseYouTubePublishInput(input: unknown): YouTubePublishInput {
  const parsed = youtubePublishInputSchema.safeParse(input)
  if (!parsed.success) {
    throw new YouTubePublisherError(
      "YOUTUBE_PUBLISH_SCHEMA_INVALID",
      "YouTube publish request failed schema validation",
      400,
    )
  }

  if (!isAllowedYouTubeSourceUrl(parsed.data.videoUrl)) {
    throw new YouTubePublisherError(
      "YOUTUBE_VIDEO_SOURCE_FORBIDDEN",
      "Video source host is not allowed",
      400,
    )
  }

  if (parsed.data.thumbnailUrl && !isAllowedYouTubeSourceUrl(parsed.data.thumbnailUrl)) {
    throw new YouTubePublisherError(
      "YOUTUBE_THUMBNAIL_SOURCE_FORBIDDEN",
      "Thumbnail source host is not allowed",
      400,
    )
  }

  return parsed.data
}

function resolveConfig() {
  const webhookUrl = process.env.AMS_N8N_YOUTUBE_PUBLISH_WEBHOOK_URL?.trim()
  const internalKey = process.env.AMS_N8N_INTERNAL_KEY?.trim()

  if (!webhookUrl) {
    throw new YouTubePublisherError(
      "YOUTUBE_N8N_WEBHOOK_MISSING",
      "AMS_N8N_YOUTUBE_PUBLISH_WEBHOOK_URL is not configured",
      503,
    )
  }

  if (!internalKey || internalKey.length < 16) {
    throw new YouTubePublisherError(
      "YOUTUBE_N8N_INTERNAL_KEY_MISSING",
      "AMS_N8N_INTERNAL_KEY is not configured safely",
      503,
    )
  }

  return { webhookUrl, internalKey }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 20_000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" })
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new YouTubePublisherError(
        "YOUTUBE_N8N_TIMEOUT",
        "YouTube publisher workflow timed out",
        504,
      )
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function sendYouTubePublishRequest(
  input: YouTubePublishInput,
): Promise<YouTubePublishResult> {
  const config = resolveConfig()
  const requestId = randomUUID()

  const response = await fetchWithTimeout(config.webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ams-internal-key": config.internalKey,
      "x-request-id": requestId,
    },
    body: JSON.stringify({
      request_id: requestId,
      source: "ams-internal-youtube-publisher",
      requested_at: new Date().toISOString(),
      video_url: input.videoUrl,
      thumbnail_url: input.thumbnailUrl ?? null,
      title: input.title,
      description: input.description,
      tags: input.tags,
      privacy_status: input.privacyStatus,
      category_id: input.categoryId,
      made_for_kids: input.madeForKids,
      notify_subscribers: input.notifySubscribers,
    }),
  })

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    return {
      ok: false,
      request_id: requestId,
      status: "failed",
      error: {
        code:
          typeof body?.error?.code === "string"
            ? body.error.code
            : `YOUTUBE_N8N_HTTP_${response.status}`,
        message: "YouTube publisher workflow request failed",
      },
    }
  }

  if (!body || typeof body !== "object") {
    return {
      ok: false,
      request_id: requestId,
      status: "failed",
      error: {
        code: "YOUTUBE_N8N_INVALID_RESPONSE",
        message: "YouTube publisher returned an invalid response",
      },
    }
  }

  const videoId = typeof body.video_id === "string" ? body.video_id : undefined
  const youtubeUrl =
    typeof body.youtube_url === "string"
      ? body.youtube_url
      : videoId
        ? `https://youtu.be/${videoId}`
        : undefined

  return {
    ok: Boolean(body.ok),
    request_id: typeof body.request_id === "string" ? body.request_id : requestId,
    status: body.ok ? (videoId ? "published" : "accepted") : "failed",
    video_id: videoId,
    youtube_url: youtubeUrl,
    privacy_status: youtubePrivacySchema.safeParse(body.privacy_status).success
      ? body.privacy_status
      : input.privacyStatus,
    thumbnail_set: typeof body.thumbnail_set === "boolean" ? body.thumbnail_set : undefined,
    error:
      body.error && typeof body.error === "object"
        ? {
            code: typeof body.error.code === "string" ? body.error.code : "YOUTUBE_N8N_ERROR",
            message:
              typeof body.error.message === "string"
                ? body.error.message
                : "YouTube publisher returned an error",
          }
        : undefined,
  }
}
