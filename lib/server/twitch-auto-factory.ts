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

type MarkerCandidate = TwitchPilotSummary["markers"][number]

export function selectAutomaticVodClipCandidates(
  summary: TwitchPilotSummary,
  maxClips = TWITCH_AUTO_FACTORY_MAX_CLIPS,
): MarkerCandidate[] {
  const limit = Math.max(0, Math.min(TWITCH_AUTO_FACTORY_MAX_CLIPS, Math.trunc(maxClips)))
  if (!summary.vod?.id || limit === 0) return []

  const existingOffsets = summary.clips
    .map((clip) => clip.vodOffset)
    .filter((value): value is number => typeof value === "number")

  const remaining = Math.max(0, limit - Math.min(summary.clips.length, limit))
  if (!remaining) return []

  return summary.markers
    .filter((marker) =>
      marker.positionSeconds >= 5 &&
      !existingOffsets.some((offset) => Math.abs(offset - marker.positionSeconds) <= 3),
    )
    .slice(0, remaining)
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
    const marker = candidates[index]
    const duration = Math.min(30, Math.max(5, marker.positionSeconds))
    const title = (marker.description || `${summary.categoryName || "Gaming"} highlight ${index + 1}`).slice(0, 100)
    try {
      await createTwitchClipFromVod({
        vodId: summary.vod.id,
        vodOffset: marker.positionSeconds,
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
