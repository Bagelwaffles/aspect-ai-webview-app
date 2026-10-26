import type { TwitchMediaQueue } from "@/lib/server/twitch-media-factory"

export const SMOKY_PUBLIC_COACHING_FEED_VERSION = "smoky-public-coaching-v1" as const

/** The queue can only be read when both parts of one supported Redis pair exist. */
type RedisCredentialEnv = Partial<Record<
  "UPSTASH_REDIS_REST_URL" | "UPSTASH_REDIS_REST_TOKEN" | "KV_REST_API_URL" | "KV_REST_API_TOKEN",
  string
>>

export function isSmokyCoachingStoreConfigured(env: RedisCredentialEnv = process.env): boolean {
  const url = env.UPSTASH_REDIS_REST_URL?.trim() || env.KV_REST_API_URL?.trim()
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim() || env.KV_REST_API_TOKEN?.trim()
  return Boolean(url && token)
}

export type SmokyPublicCoachingItem = {
  clipId: string
  title: string
  clipUrl: string
  analyzedAt: string
  score: number
  observation: string
  editingNote: string
  nextMission: string
  source: "ams-twitch-video-analysis-v3"
  scope: "twitch-clip-only"
}

export function safePublicTwitchClipUrl(raw: string): string | null {
  try {
    const url = new URL(raw)
    if (url.protocol !== "https:" || url.username || url.password) return null
    const host = url.hostname.toLowerCase()
    const path = url.pathname
    const valid =
      (host === "clips.twitch.tv" && /^\/[A-Za-z0-9_-]{3,160}\/?$/.test(path)) ||
      ((host === "www.twitch.tv" || host === "twitch.tv") &&
        /^\/smokybanana03\/clip\/[A-Za-z0-9_-]{3,160}\/?$/i.test(path))
    if (!valid) return null
    // Remove all untrusted tracking/query/hash parameters.
    return url.origin + path
  } catch {
    return null
  }
}

/**
 * Public-safe, explicitly clip-scoped projection from the EXISTING AMS
 * media-analysis queue. No credentials, Redis keys, object keys, VOD
 * mapping, private drafts, auto-post status, or personal metrics escape.
 */
export function buildSmokyPublicCoachingFeed(
  queue: TwitchMediaQueue | null,
  limit = 12,
): SmokyPublicCoachingItem[] {
  if (!queue || queue.broadcasterLogin.toLowerCase() !== "smokybanana03" || !queue.mediaAuthorized) {
    return []
  }

  const projected: SmokyPublicCoachingItem[] = []
  const seen = new Set<string>()
  const count = Math.max(1, Math.min(20, Math.floor(limit) || 12))

  for (const item of queue.items) {
    const a = item.videoAnalysis
    if (!a || a.version !== "twitch-video-analysis-v3" || a.clipId !== item.clipId) continue
    if (a.model.toLowerCase().includes("deterministic") || !a.model.trim()) continue
    if (a.recommendation !== "render" || a.score < 65) continue
    if (!item.objectKey || !item.importedAt || item.status === "discovered") continue
    if (!a.observedMoments?.length || !a.observedMoments[0]?.trim()) continue
    if (!Number.isFinite(Date.parse(a.analyzedAt))) continue
    const clipUrl = safePublicTwitchClipUrl(item.twitchUrl)
    if (!clipUrl || seen.has(item.clipId)) continue
    seen.add(item.clipId)
    projected.push({
      clipId: item.clipId.slice(0, 160),
      title: (item.title || "Smoky's clip").slice(0, 140),
      clipUrl,
      analyzedAt: a.analyzedAt,
      score: a.score,
      observation: a.observedMoments[0].trim().slice(0, 240),
      // The analysis "reason" describes EDITING/render eligibility. Do
      // not misrepresent it as a model's judgment of gameplay technique.
      editingNote: a.reason.trim().slice(0, 300),
      nextMission: "Watch this clip and explain one move you would repeat or change next stream.",
      source: "ams-twitch-video-analysis-v3",
      scope: "twitch-clip-only",
    })
  }

  return projected
    .sort((a, b) => Date.parse(b.analyzedAt) - Date.parse(a.analyzedAt))
    .slice(0, count)
}
