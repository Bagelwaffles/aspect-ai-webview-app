import assert from "node:assert/strict"
import test from "node:test"

import { buildSmokyPublicCoachingFeed, safePublicTwitchClipUrl } from "../lib/server/smoky-public-coaching"
import type { TwitchMediaQueue } from "../lib/server/twitch-media-factory"

const record = {
  version: "twitch-video-analysis-v3",
  clipId: "GreatPlay-ABC123",
  analyzedAt: "2026-10-25T15:00:00.000Z",
  model: "google/gemini-2.5-flash",
  score: 91,
  recommendation: "render",
  reason: "The action has a clear opening and a payoff.",
  observedMoments: ["The player used cover before a short firefight."],
  bestStartSeconds: 8,
  bestEndSeconds: 25,
  hook: "A close fight",
  caption: "Public clip",
  evidenceBoundary: "Analyzed clip only.",
}

function queue(overrides: Record<string, unknown> = {}, itemOverrides: Record<string, unknown> = {}): TwitchMediaQueue {
  return {
    version: "twitch-media-factory-v1",
    streamId: "stream-test",
    broadcasterId: "1234",
    broadcasterLogin: "smokybanana03",
    generatedAt: "2026-10-25T16:00:00.000Z",
    mediaAuthorized: true,
    items: [{
      clipId: "GreatPlay-ABC123",
      title: "A fun clutch",
      twitchUrl: "https://clips.twitch.tv/GreatPlay-ABC123?utm_source=test",
      creatorName: "user",
      createdAt: "2026-10-25T14:00:00.000Z",
      duration: 35,
      vodOffset: 50,
      videoId: "123",
      thumbnailUrl: "https://example.com/img",
      status: "short-ready",
      orientation: "portrait",
      objectKey: "PRIVATE_OBJECT_KEY_DO_NOT_LEAK",
      importedAt: "2026-10-25T14:01:00.000Z",
      videoAnalysis: record,
      shortDraft: { title: "A fun clutch", hook: "Clutch", caption: "Clip", hashtags: [] },
      ...itemOverrides,
    }],
    ...overrides,
  } as unknown as TwitchMediaQueue
}

test("exports only a public-safe clip observation with no private fields", () => {
  const result = buildSmokyPublicCoachingFeed(queue())
  assert.equal(result.length, 1)
  assert.equal(result[0].scope, "twitch-clip-only")
  assert.equal(result[0].clipUrl, "https://clips.twitch.tv/GreatPlay-ABC123")
  assert.match(result[0].observation, /used cover/)
  assert.equal(result[0].source, "ams-twitch-video-analysis-v3")
  const output = JSON.stringify(result)
  assert.doesNotMatch(output, /PRIVATE_OBJECT_KEY_DO_NOT_LEAK|broadcasterId|shortDraft|thumbnailUrl|videoId|vodOffset/)
})

test("wrong creator and missing media authorization fail closed", () => {
  assert.deepEqual(buildSmokyPublicCoachingFeed(queue({ broadcasterLogin: "anotherperson" })), [])
  assert.deepEqual(buildSmokyPublicCoachingFeed(queue({ mediaAuthorized: false })), [])
  assert.deepEqual(buildSmokyPublicCoachingFeed(null), [])
})

test("unseen or low-confidence or synthetic footage cannot become coaching", () => {
  for (const a of [
    { ...record, version: "twitch-video-analysis-v1" },
    { ...record, recommendation: "skip" },
    { ...record, score: 22 },
    { ...record, model: "deterministic-fallback" },
    { ...record, observedMoments: [] },
    { ...record, clipId: "wrong-clip" },
  ]) {
    assert.deepEqual(buildSmokyPublicCoachingFeed(queue({}, { videoAnalysis: a })), [])
  }
  assert.deepEqual(buildSmokyPublicCoachingFeed(queue({}, { status: "discovered" })), [])
  assert.deepEqual(buildSmokyPublicCoachingFeed(queue({}, { objectKey: null })), [])
})

test("rejects malicious or non-Smoky links", () => {
  const malicious = [
    "http://clips.twitch.tv/GreatPlay-ABC123",
    "https://clips.twitch.tv.evil.example/GreatPlay-ABC123",
    "https://twitch.tv/not-smoky/clip/GreatPlay-ABC123",
    "https://user:password@clips.twitch.tv/GreatPlay-ABC123",
    "javascript:alert(1)",
  ]
  for (const url of malicious) {
    assert.equal(safePublicTwitchClipUrl(url), null)
    assert.deepEqual(buildSmokyPublicCoachingFeed(queue({}, { twitchUrl: url })), [])
  }
  assert.equal(safePublicTwitchClipUrl("https://www.twitch.tv/SmokyBanana03/clip/GreatPlay-ABC123?filter=x"),
    "https://www.twitch.tv/SmokyBanana03/clip/GreatPlay-ABC123")
})
