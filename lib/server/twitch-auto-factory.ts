import {
  createTwitchClipFromVod,
  getTwitchPilotStatus,
  refreshTwitchPostStreamSummary,
  TWITCH_MEDIA_SCOPE,
  type TwitchPilotSummary,
} from "@/lib/server/twitch-pilot"
import {
  importTwitchClipMedia,
  syncLatestTwitchMediaQueue,
} from "@/lib/server/twitch-media-factory"
import {
  enqueueTwitchShortRender,
  isTwitchShortRenderConfigured,
} from "@/lib/server/twitch-short-render-jobs"
import {
  analyzeTwitchClipVideo,
  isTwitchVideoAnalysisRenderEligible,
} from "@/lib/server/twitch-video-analysis"

export const TWITCH_AUTO_FACTORY_MAX_CLIPS = 3
export const TWITCH_AUTO_FACTORY_MAX_ANALYSES = 5

type AutomaticVodClipCandidate = {
  id: string
  description: string
  positionSeconds: number
  source: "marker" | "sample"
}

export function selectAutomaticVodClipCandidates(
  summary: TwitchPilotSummary,
  maxClips = TWITCH_AUTO_FACTORY_MAX_CLIPS,
): AutomaticVodClipCandidate[] {
  const limit = Math.max(0, Math.min(TWITCH_AUTO_FACTORY_MAX_CLIPS, Math.trunc(maxClips)))
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

function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 200) : "UNKNOWN"
}

export async function runTwitchAutomaticPrivateShorts() {
  const status = await getTwitchPilotStatus()
  const scopes = status.connection?.scopes ?? []

  if (!status.connected || !scopes.includes(TWITCH_MEDIA_SCOPE)) {
    return { ok: true, skipped: "TWITCH_MEDIA_SCOPE_REQUIRED", created: 0, queued: 0, failures: [] as string[] }
  }
  if (!isTwitchShortRenderConfigured()) {
    return { ok: true, skipped: "TWITCH_SHORT_RENDER_NOT_CONFIGURED", created: 0, queued: 0, failures: [] as string[] }
  }

  const summary = await refreshTwitchPostStreamSummary()
  if (!summary?.vod?.id) {
    return { ok: true, skipped: "TWITCH_COMPLETED_VOD_REQUIRED", created: 0, queued: 0, failures: [] as string[] }
  }

  const failures: string[] = []
  let created = 0
  const candidates = selectAutomaticVodClipCandidates(summary)

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]
    const duration = Math.min(30, Math.max(15, Math.round(Math.min(30, summary.durationMinutes * 60 / 6))))
    const title = (candidate.description || `${summary.categoryName || "Gaming"} candidate ${index + 1}`).slice(0, 100)
    try {
      await createTwitchClipFromVod({
        vodId: summary.vod.id,
        vodOffset: candidate.positionSeconds,
        duration,
        title,
      })
      created += 1
    } catch (error) {
      failures.push(`create:${safeError(error)}`)
    }
  }

  // Twitch clip creation is asynchronous. A later worker run will pick up newly
  // created clips if they are not visible yet on this pass.
  const queue = await syncLatestTwitchMediaQueue().catch((error) => {
    failures.push(`sync:${safeError(error)}`)
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
    .slice(0, TWITCH_AUTO_FACTORY_MAX_CLIPS)

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
    streamId: summary.streamId,
    created,
    analyzed: analyzed.length,
    queued,
    failures,
  }
}
