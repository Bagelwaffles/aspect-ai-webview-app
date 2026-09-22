import assert from "node:assert/strict"
import test from "node:test"

import {
  isTwitchVideoAnalysisRenderEligible,
  TWITCH_VIDEO_RENDER_SCORE_MIN,
} from "../lib/server/twitch-video-analysis"

test("Twitch video analysis requires both a render recommendation and the score threshold", () => {
  assert.equal(TWITCH_VIDEO_RENDER_SCORE_MIN, 65)
  assert.equal(isTwitchVideoAnalysisRenderEligible({ score: 65, recommendation: "render" }), true)
  assert.equal(isTwitchVideoAnalysisRenderEligible({ score: 64, recommendation: "render" }), false)
  assert.equal(isTwitchVideoAnalysisRenderEligible({ score: 99, recommendation: "skip" }), false)
})
