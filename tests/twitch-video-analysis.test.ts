import assert from "node:assert/strict"
import test from "node:test"

import {
  buildTwitchPublishMetadata,
  isTwitchVideoAnalysisRenderEligible,
  parseTwitchVideoEvidenceText,
  TWITCH_VIDEO_RENDER_SCORE_MIN,
} from "../lib/server/twitch-video-analysis"
import { twitchVideoAnalysisRecordSchema } from "../lib/server/twitch-media-factory"
import { personalizeTwitchCreatorCopy } from "../lib/server/twitch-creator-copy"

test("Twitch video analysis requires both a render recommendation and the score threshold", () => {
  assert.equal(TWITCH_VIDEO_RENDER_SCORE_MIN, 65)
  assert.equal(isTwitchVideoAnalysisRenderEligible({ score: 65, recommendation: "render" }), true)
  assert.equal(isTwitchVideoAnalysisRenderEligible({ score: 64, recommendation: "render" }), false)
  assert.equal(isTwitchVideoAnalysisRenderEligible({ score: 99, recommendation: "skip" }), false)
})


test("Twitch video analysis v2 carries complete publish metadata", () => {
  const parsed = twitchVideoAnalysisRecordSchema.parse({
    version: "twitch-video-analysis-v2",
    clipId: "clip-1",
    analyzedAt: "2026-09-22T01:30:00.000Z",
    model: "google/gemini-2.5-flash",
    score: 88,
    recommendation: "render",
    reason: "Clear action and visible payoff.",
    observedMoments: ["Visible combat sequence"],
    bestStartSeconds: 4,
    bestEndSeconds: 18,
    hook: "That turn changed everything.",
    caption: "A fast Call of Duty moment from SmokyBanana03.",
    publishMetadata: {
      title: "Fast Call of Duty Turnaround",
      description: "A short gameplay moment featuring a quick turnaround during a Call of Duty match.",
      tags: ["Call of Duty", "gaming", "Twitch"],
      hashtags: ["#CallOfDuty", "#Gaming", "#Twitch"],
      keywords: ["Call of Duty gameplay", "gaming short", "Twitch clip"],
      categoryLabel: "Gaming",
      twitchClipTitle: "Fast COD Turnaround",
      youtube: {
        title: "Fast Call of Duty Turnaround",
        description: "A quick Call of Duty gameplay moment from SmokyBanana03.",
        tags: ["Call of Duty", "gaming", "shorts"],
        hashtags: ["#CallOfDuty", "#Gaming", "#Shorts"],
      },
      tiktok: {
        caption: "That turnaround was fast.",
        hashtags: ["#CallOfDuty", "#Gaming", "#Twitch"],
      },
      instagram: {
        caption: "A quick Call of Duty turnaround from the stream.",
        hashtags: ["#CallOfDuty", "#Gaming", "#Reels"],
      },
      x: {
        post: "A quick Call of Duty turnaround from SmokyBanana03.",
      },
    },
    evidenceBoundary: "Metadata is limited to visible and audible events in this clip.",
  })

  assert.equal(parsed.publishMetadata?.title, "Fast Call of Duty Turnaround")
  assert.equal(parsed.publishMetadata?.youtube.title, "Fast Call of Duty Turnaround")
  assert.equal(parsed.publishMetadata?.tags.length, 3)
})


test("Twitch video evidence parser accepts fenced JSON and ignores surrounding text", () => {
  const fenced = [
    "```json",
    "{",
    '  "score": 82,',
    '  "recommendation": "render",',
    '  "reason": "Visible action has a clear payoff.",',
    '  "observedMoments": ["Player lands a visible shot and immediately changes position."],',
    '  "bestStartSeconds": 4,',
    '  "bestEndSeconds": 16,',
    '  "hook": "Quick shot, instant reposition.",',
    '  "caption": "A fast gameplay moment with a visible shot and immediate reposition.",',
    '  "evidenceBoundary": "Claims are limited to visible and audible events in this clip."',
    "}",
    "```",
  ].join("\n")
  const parsed = parseTwitchVideoEvidenceText(fenced)
  assert.equal(parsed.score, 82)
  assert.equal(parsed.recommendation, "render")
  assert.equal(parsed.bestStartSeconds, 4)
})

test("Twitch publish metadata is built from verified video evidence without another model call", () => {
  const evidence = parseTwitchVideoEvidenceText(JSON.stringify({
    score: 88,
    recommendation: "render",
    reason: "Clear action and payoff.",
    observedMoments: ["Player escapes pressure and reaches cover."],
    bestStartSeconds: 3,
    bestEndSeconds: 17,
    hook: "A clean escape under pressure.",
    caption: "The player escapes pressure and reaches cover in this gameplay clip.",
    evidenceBoundary: "Only visible and audible events are described.",
  }))
  const metadata = buildTwitchPublishMetadata({
    creatorName: "SmokyBanana03",
    sourceTitle: "Evening stream",
    evidence,
  })

  assert.match(metadata.title, /escapes pressure/i)
  assert.equal(metadata.youtube.title.length <= 100, true)
  assert.equal(metadata.tags.length >= 3, true)
  assert.equal(metadata.hashtags.length >= 3, true)
  assert.match(metadata.description, /SmokyBanana03/)
})


test("Twitch creator copy replaces generic streamer wording with the channel name", () => {
  assert.equal(
    personalizeTwitchCreatorCopy(
      "Streamer's hilarious reaction to rapid eliminations!",
      "SmokyBanana03",
    ),
    "SmokyBanana03’s hilarious reaction to rapid eliminations!",
  )
  assert.equal(
    personalizeTwitchCreatorCopy(
      "Watch this streamer's epic reaction after securing multiple eliminations.",
      "SmokyBanana03",
    ),
    "Watch SmokyBanana03’s epic reaction after securing multiple eliminations.",
  )
})
