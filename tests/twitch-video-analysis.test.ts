import assert from "node:assert/strict"
import test from "node:test"

import {
  isTwitchVideoAnalysisRenderEligible,
  recoverTwitchVideoAnalysisOutput,
  TWITCH_VIDEO_RENDER_SCORE_MIN,
} from "../lib/server/twitch-video-analysis"
import { twitchVideoAnalysisRecordSchema } from "../lib/server/twitch-media-factory"

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


test("Twitch video analysis recovers schema-valid JSON from fenced model output", () => {
  const raw = `Here is the analysis:
\`\`\`json
{
  "score": 82,
  "recommendation": "render",
  "reason": "Clear visible action with a defined payoff.",
  "observedMoments": ["Visible gameplay action"],
  "bestStartSeconds": 3,
  "bestEndSeconds": 18,
  "hook": "Watch this turn.",
  "caption": "A short gameplay moment.",
  "publishMetadata": {
    "title": "Gameplay Turnaround",
    "description": "A concise description grounded in the clip.",
    "tags": ["gaming", "Twitch", "gameplay"],
    "hashtags": ["#Gaming", "#Twitch", "#Shorts"],
    "keywords": ["gaming clip", "Twitch gameplay", "short video"],
    "categoryLabel": "Gaming",
    "twitchClipTitle": "Gameplay Turnaround",
    "youtube": {
      "title": "Gameplay Turnaround",
      "description": "A concise gameplay Short.",
      "tags": ["gaming", "Twitch", "shorts"],
      "hashtags": ["#Gaming", "#Twitch", "#Shorts"]
    },
    "tiktok": {
      "caption": "A quick gameplay moment.",
      "hashtags": ["#Gaming", "#Twitch", "#Gameplay"]
    },
    "instagram": {
      "caption": "A quick gameplay moment.",
      "hashtags": ["#Gaming", "#Twitch", "#Reels"]
    },
    "x": {
      "post": "A quick gameplay moment from the stream."
    }
  },
  "evidenceBoundary": "Claims are limited to visible and audible events in the clip."
}
\`\`\`
`

  const recovered = recoverTwitchVideoAnalysisOutput(raw)
  assert.ok(recovered)
  assert.equal(recovered.score, 82)
  assert.equal(recovered.publishMetadata.title, "Gameplay Turnaround")
})

test("Twitch video analysis refuses recovered JSON that violates the schema", () => {
  const recovered = recoverTwitchVideoAnalysisOutput('{"score":82,"recommendation":"render"}')
  assert.equal(recovered, null)
})
