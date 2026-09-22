import {
  createTwitchClipFromVod,
  getTwitchPilotStatus,
  getTwitchRecentArchive,
  TWITCH_MEDIA_SCOPE,
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

export const TWITCH_AUTO_FACTORY_MAX_CLIPS_PER_VOD_PER_VOD = 3
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
) {
  const limit = Math.max(0, Math.min(TWITCH_AUTO_FACTORY_MAX_CLIPS_PER_VOD, Math.trunc(maxClips)))
  if (!vod.id || vod.durationSeconds < 20 || limit === 0) return []

  const existing = clips.filter((clip) => clip.videoId === vod.id)
  const remaining = Math.max(0, limit - Math.min(existing.length, limit))
  if (!remaining) return []

  const fractions = remaining === 1 ? [0.5] : remaining === 2 ? [1 / 3, 2 / 3] : [0.25, 0.5, 0.75]
  return fractions.map((fraction, index) => {
    const offset = Math.max(10, Math.min(vod.durationSeconds - 5, Math.round(vod.durationSeconds * fraction)))
    return {
      id: `vod-${vod.id}-sample-${index + 1}-${offset}`,
      description: `${vod.title || "Twitch stream"} daily sample ${index + 1}`,
      positionSeconds: offset,
      source: "sample" as const,
    }
  }).filter((candidate, index, all) =>
    all.findIndex((item) => item.positionSeconds === candidate.positionSeconds) === index &&
    !existing.some((clip) => typeof clip.vodOffset === "number" && Math.abs(clip.vodOffset - candidate.positionSeconds) <= 5),
  )
}

function dailyQueueKey(now = new Date()) {
  return `day-${now.toISOString().slice(0, 10)}`
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 200) : "UNKNOWN"
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
  let created = 0

  for (const vod of archive.vods) {
    const candidates = selectDailyVodSampleCandidates(vod, archive.clips)
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]
      const duration = Math.min(30, Math.max(15, Math.round(Math.min(30, vod.durationSeconds / 6))))
      try {
        await createTwitchClipFromVod({
          vodId: vod.id,
          vodOffset: candidate.positionSeconds,
          duration,
          title: candidate.description.slice(0, 100),
        })
        created += 1
      } catch (error) {
        failures.push(`${vod.id}:create:${safeError(error)}`)
      }
    }
  }

  // Twitch clip creation is asynchronous. Existing/manual clips plus any newly
  // materialized clips are processed now; newly created clips can join on a later
  // scheduled pass without duplicating VOD sampling once their offsets are visible.
  const refreshedArchive = await getTwitchRecentArchive(24).catch((error) => {
    failures.push(`archive-refresh:${safeError(error)}`)
    return archive
  })

  const dayClips = refreshedArchive.clips
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
    analyzed: analyzed.length,
    queued,
    failures,
  }
}
