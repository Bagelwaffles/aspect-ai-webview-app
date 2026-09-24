import {
  createTwitchClipFromVod,
  getTwitchPilotStatus,
  getTwitchRecentArchive,
  reconcilePendingTwitchVodClips,
  TWITCH_MEDIA_SCOPE,
  type PendingTwitchVodClip,
  type TwitchPilotSummary,
  type TwitchRecentClip,
  type TwitchRecentVod,
} from "@/lib/server/twitch-pilot"
import {
  importTwitchClipMedia,
  syncTwitchDailyMediaQueue,
} from "@/lib/server/twitch-media-factory"
import {
  enqueueTwitchShortRender,
  isTwitchShortRenderConfigured,
} from "@/lib/server/twitch-short-render-jobs"
import {
  analyzeTwitchClipVideo,
  isTwitchVideoAnalysisRenderEligible,
} from "@/lib/server/twitch-video-analysis"

export const TWITCH_AUTO_FACTORY_MAX_CLIPS_PER_VOD = 3
export const TWITCH_AUTO_FACTORY_MAX_DAY_CLIPS = 15
export const TWITCH_AUTO_FACTORY_MAX_ANALYSES = 15
export const TWITCH_AUTO_FACTORY_MAX_RENDERS = 6

type AutomaticVodClipCandidate = {
  id: string
  description: string
  positionSeconds: number
  source: "marker" | "sample"
}

export function selectAutomaticVodClipCandidates(
  summary: TwitchPilotSummary,
  maxClips = TWITCH_AUTO_FACTORY_MAX_CLIPS_PER_VOD,
): AutomaticVodClipCandidate[] {
  const limit = Math.max(0, Math.min(TWITCH_AUTO_FACTORY_MAX_CLIPS_PER_VOD, Math.trunc(maxClips)))
  if (!summary.vod?.id || limit === 0) return []

  const existingOffsets = summary.clips
    .map((clip) => clip.vodOffset)
    .filter((value): value is number => typeof value === "number")

  const remaining = Math.max(0, limit - Math.min(summary.clips.length, limit))
  if (!remaining) return []

  const markerCandidates = summary.markers
    .filter((marker) =>
      marker.positionSeconds >= 5 &&
      !existingOffsets.some((offset) => Math.abs(offset - marker.positionSeconds) <= 3),
    )
    .map((marker) => ({
      id: marker.id,
      description: marker.description || "Creator marker",
      positionSeconds: marker.positionSeconds,
      source: "marker" as const,
    }))
    .slice(0, remaining)

  if (markerCandidates.length >= remaining) return markerCandidates

  const durationSeconds = Math.max(0, Math.round(summary.durationMinutes * 60))
  if (durationSeconds < 20) return markerCandidates

  const needed = remaining - markerCandidates.length
  const fractions = needed === 1 ? [0.5] : needed === 2 ? [1 / 3, 2 / 3] : [0.25, 0.5, 0.75]
  const sampled = fractions
    .map((fraction, index) => {
      const positionSeconds = Math.max(10, Math.min(durationSeconds - 5, Math.round(durationSeconds * fraction)))
      return {
        id: `sample-${index + 1}-${positionSeconds}`,
        description: `${summary.categoryName || "Gaming"} sampled moment ${index + 1}`,
        positionSeconds,
        source: "sample" as const,
      }
    })
    .filter((candidate, index, all) =>
      all.findIndex((item) => item.positionSeconds === candidate.positionSeconds) === index &&
      !existingOffsets.some((offset) => Math.abs(offset - candidate.positionSeconds) <= 5) &&
      !markerCandidates.some((marker) => Math.abs(marker.positionSeconds - candidate.positionSeconds) <= 5),
    )
    .slice(0, needed)

  return [...markerCandidates, ...sampled]
}

export function selectDailyVodSampleCandidates(
  vod: TwitchRecentVod,
  clips: TwitchRecentClip[],
  maxClips = TWITCH_AUTO_FACTORY_MAX_CLIPS_PER_VOD,
  reserved: Array<Pick<PendingTwitchVodClip, "vodId" | "vodOffset">> = [],
) {
  const limit = Math.max(0, Math.min(TWITCH_AUTO_FACTORY_MAX_CLIPS_PER_VOD, Math.trunc(maxClips)))
  if (!vod.id || vod.durationSeconds < 20 || limit === 0) return []

  const existing = clips.filter((clip) => clip.videoId === vod.id)
  const reservedForVod = reserved.filter((item) => item.vodId === vod.id)
  const remaining = Math.max(0, limit - Math.min(existing.length + reservedForVod.length, limit))
  if (!remaining) return []

  const preferred = remaining === 1 ? [0.5] : remaining === 2 ? [1 / 3, 2 / 3] : [0.25, 0.5, 0.75]
  const fallbackFractions = [...preferred, 0.2, 0.4, 0.6, 0.8, 0.125, 0.875]

  return fallbackFractions.map((fraction, index) => {
    const offset = Math.max(10, Math.min(vod.durationSeconds - 5, Math.round(vod.durationSeconds * fraction)))
    return {
      id: `vod-${vod.id}-sample-${index + 1}-${offset}`,
      description: `${vod.title || "Twitch stream"} daily sample ${index + 1}`,
      positionSeconds: offset,
      source: "sample" as const,
    }
  }).filter((candidate, index, all) =>
    all.findIndex((item) => item.positionSeconds === candidate.positionSeconds) === index &&
    !existing.some((clip) => typeof clip.vodOffset === "number" && Math.abs(clip.vodOffset - candidate.positionSeconds) <= 5) &&
    !reservedForVod.some((item) => Math.abs(item.vodOffset - candidate.positionSeconds) <= 5),
  ).slice(0, remaining)
}

function dailyQueueKey(now = new Date()) {
  return `day-${now.toISOString().slice(0, 10)}`
}

function safeError(error: unknown) {
  if (!(error instanceof Error)) return "UNKNOWN"
  const message = error.message.slice(0, 300)
  const knownCode = message.match(/\b(?:TWITCH|AMS|AI|R2|MEDIA|GATEWAY|MODEL)_[A-Z0-9_:-]{2,160}\b/)?.[0]
  if (knownCode) return knownCode
  const httpCode = message.match(/\b(?:HTTP|STATUS)[: _-]?(\d{3})\b/i)?.[1]
  if (httpCode) return `HTTP_${httpCode}`
  return error.name.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80) || "ERROR"
}

export async function runTwitchAutomaticPrivateShorts() {
  const status = await getTwitchPilotStatus()
  const scopes = status.connection?.scopes ?? []

  if (!status.connected || !status.connection || !scopes.includes(TWITCH_MEDIA_SCOPE)) {
    return { ok: true, skipped: "TWITCH_MEDIA_SCOPE_REQUIRED", created: 0, queued: 0, failures: [] as string[] }
  }
  if (!isTwitchShortRenderConfigured()) {
    return { ok: true, skipped: "TWITCH_SHORT_RENDER_NOT_CONFIGURED", created: 0, queued: 0, failures: [] as string[] }
  }

  const archive = await getTwitchRecentArchive(24)
  if (!archive.vods.length) {
    return {
      ok: true,
      skipped: "TWITCH_DAILY_VODS_REQUIRED",
      vodCount: 0,
      clipCount: archive.clips.length,
      created: 0,
      analyzed: 0,
      queued: 0,
      failures: [] as string[],
    }
  }

  const failures: string[] = []
  const reconciliation = await reconcilePendingTwitchVodClips().catch((error) => {
    failures.push(`pending-reconcile:${safeError(error)}`)
    return {
      materialized: [] as TwitchRecentClip[],
      failed: [] as PendingTwitchVodClip[],
      pending: [] as PendingTwitchVodClip[],
    }
  })

  const knownClips = [...archive.clips]
  const knownClipIds = new Set(knownClips.map((clip) => clip.id))
  for (const clip of reconciliation.materialized) {
    if (!knownClipIds.has(clip.id)) {
      knownClips.push(clip)
      knownClipIds.add(clip.id)
    }
  }

  const reservations = [...reconciliation.pending, ...reconciliation.failed]
  let created = 0
  let trackedCreated = 0

  for (const vod of archive.vods) {
    const candidates = selectDailyVodSampleCandidates(
      vod,
      knownClips,
      TWITCH_AUTO_FACTORY_MAX_CLIPS_PER_VOD,
      reservations,
    )
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]
      const duration = Math.min(30, Math.max(15, Math.round(Math.min(30, vod.durationSeconds / 6))))
      try {
        const clip = await createTwitchClipFromVod({
          vodId: vod.id,
          vodOffset: candidate.positionSeconds,
          duration,
          title: candidate.description.slice(0, 100),
        })
        created += 1
        if (clip.tracked) {
          trackedCreated += 1
          reservations.push({
            id: clip.id,
            vodId: vod.id,
            vodOffset: candidate.positionSeconds,
            duration,
            title: candidate.description.slice(0, 100),
            requestedAt: new Date().toISOString(),
          })
        } else {
          failures.push(`${vod.id}:track:TWITCH_VOD_CLIP_PENDING_STORE_UNAVAILABLE`)
        }
      } catch (error) {
        failures.push(`${vod.id}:create:${safeError(error)}`)
      }
    }
  }

  const refreshedArchive = await getTwitchRecentArchive(24).catch((error) => {
    failures.push(`archive-refresh:${safeError(error)}`)
    return archive
  })

  const combinedClips = [...refreshedArchive.clips]
  const combinedClipIds = new Set(combinedClips.map((clip) => clip.id))
  for (const clip of reconciliation.materialized) {
    if (!combinedClipIds.has(clip.id)) {
      combinedClips.push(clip)
      combinedClipIds.add(clip.id)
    }
  }

  const dayClips = combinedClips
    .filter((clip) => refreshedArchive.vods.some((vod) => vod.id === clip.videoId))
    .sort((left, right) => Date.parse(right.createdAt || "0") - Date.parse(left.createdAt || "0"))
    .slice(0, TWITCH_AUTO_FACTORY_MAX_DAY_CLIPS)

  const queue = await syncTwitchDailyMediaQueue({
    dayKey: dailyQueueKey(),
    broadcasterId: status.connection.broadcasterId,
    broadcasterLogin: status.connection.login,
    scopes,
    clips: dayClips,
  }).catch((error) => {
    failures.push(`daily-queue:${safeError(error)}`)
    return null
  })

  const analyzed: Array<{ clipId: string; score: number }> = []
  for (const item of (queue?.items ?? []).slice(0, TWITCH_AUTO_FACTORY_MAX_ANALYSES)) {
    try {
      let current = item
      if (current.status === "discovered") {
        const imported = await importTwitchClipMedia(current.clipId)
        current = imported.item
      }
      if (current.status === "discovered") continue

      const analysis = await analyzeTwitchClipVideo(current.clipId)
      analyzed.push({ clipId: current.clipId, score: analysis.score })
    } catch (error) {
      failures.push(`${item.clipId}:analysis:${safeError(error)}`)
    }
  }

  const ranked = [...analyzed]
    .sort((left, right) => right.score - left.score)
    .slice(0, TWITCH_AUTO_FACTORY_MAX_RENDERS)

  let queued = 0
  for (const candidate of ranked) {
    try {
      const analysis = await analyzeTwitchClipVideo(candidate.clipId)
      if (!isTwitchVideoAnalysisRenderEligible(analysis)) continue
      await enqueueTwitchShortRender(candidate.clipId)
      queued += 1
    } catch (error) {
      failures.push(`${candidate.clipId}:render:${safeError(error)}`)
    }
  }

  return {
    ok: true,
    skipped: null,
    windowHours: 24,
    vodCount: refreshedArchive.vods.length,
    clipCount: dayClips.length,
    created,
    verified: reconciliation.materialized.length,
    pending: reconciliation.pending.length + trackedCreated,
    expired: reconciliation.failed.length,
    analyzed: analyzed.length,
    queued,
    failures,
  }
}
