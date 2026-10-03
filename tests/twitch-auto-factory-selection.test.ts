import assert from "node:assert/strict"
import test from "node:test"

import {
  selectBestAnalyzedClipsPerStream,
  TWITCH_AUTO_FACTORY_THIRD_CLIP_SCORE_MIN,
} from "../lib/server/twitch-auto-factory"
import type { TwitchVideoAnalysisRecord } from "../lib/server/twitch-media-factory"

function analysis(
  clipId: string,
  score: number,
  recommendation: "render" | "skip" = "render",
): TwitchVideoAnalysisRecord {
  return {
    version: "twitch-video-analysis-v3",
    clipId,
    analyzedAt: "2026-10-03T20:00:00.000Z",
    model: "google/gemini-2.5-flash",
    score,
    recommendation,
    reason: "Test ranking evidence.",
    observedMoments: ["Observed gameplay moment"],
    bestStartSeconds: 1,
    bestEndSeconds: 20,
    hook: "Observed gameplay moment",
    caption: "Observed gameplay moment from the stream.",
    evidenceBoundary: "Test fixture based on validated clip media.",
  }
}

test("selects the best two clips per stream and adds a third only above the quality threshold", () => {
  const selected = selectBestAnalyzedClipsPerStream([
    { clipId: "a-low", sourceVideoId: "vod-a", score: 66, analysis: analysis("a-low", 66) },
    { clipId: "a-best", sourceVideoId: "vod-a", score: 94, analysis: analysis("a-best", 94) },
    { clipId: "a-third", sourceVideoId: "vod-a", score: TWITCH_AUTO_FACTORY_THIRD_CLIP_SCORE_MIN, analysis: analysis("a-third", TWITCH_AUTO_FACTORY_THIRD_CLIP_SCORE_MIN) },
    { clipId: "a-fourth", sourceVideoId: "vod-a", score: 91, analysis: analysis("a-fourth", 91) },
    { clipId: "b-best", sourceVideoId: "vod-b", score: 90, analysis: analysis("b-best", 90) },
    { clipId: "b-second", sourceVideoId: "vod-b", score: 72, analysis: analysis("b-second", 72) },
    { clipId: "b-third-weak", sourceVideoId: "vod-b", score: TWITCH_AUTO_FACTORY_THIRD_CLIP_SCORE_MIN - 1, analysis: analysis("b-third-weak", TWITCH_AUTO_FACTORY_THIRD_CLIP_SCORE_MIN - 1) },
    { clipId: "b-skip", sourceVideoId: "vod-b", score: 99, analysis: analysis("b-skip", 99, "skip") },
  ])

  const streamA = selected.filter((item) => item.sourceVideoId === "vod-a")
  const streamB = selected.filter((item) => item.sourceVideoId === "vod-b")

  assert.deepEqual(
    streamA.map((item) => [item.clipId, item.rank]),
    [["a-best", 1], ["a-fourth", 2], ["a-third", 3]],
  )
  assert.deepEqual(
    streamB.map((item) => [item.clipId, item.rank]),
    [["b-best", 1], ["b-second", 2]],
  )
  assert.equal(streamA.length <= 3, true)
  assert.equal(streamB.length <= 3, true)
})

test("never forces low-quality clips just to reach two or three posts", () => {
  const selected = selectBestAnalyzedClipsPerStream([
    { clipId: "good", sourceVideoId: "vod-c", score: 80, analysis: analysis("good", 80) },
    { clipId: "weak", sourceVideoId: "vod-c", score: 40, analysis: analysis("weak", 40, "skip") },
  ])

  assert.deepEqual(
    selected.map((item) => [item.clipId, item.rank]),
    [["good", 1]],
  )
})
