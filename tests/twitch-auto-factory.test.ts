import assert from "node:assert/strict"
import test from "node:test"

import { selectAutomaticVodClipCandidates } from "../lib/server/twitch-auto-factory"
import type { TwitchPilotSummary } from "../lib/server/twitch-pilot"

function summary(overrides: Partial<TwitchPilotSummary> = {}): TwitchPilotSummary {
  return {
    broadcasterId: "155477801",
    broadcasterLogin: "smokybanana03",
    broadcasterName: "SmokyBanana03",
    streamId: "stream-1",
    startedAt: "2026-09-21T23:00:00.000Z",
    endedAt: "2026-09-21T23:30:00.000Z",
    durationMinutes: 30,
    title: "COD test",
    categoryName: "Call of Duty",
    vod: {
      id: "vod-1",
      title: "COD test",
      url: "https://www.twitch.tv/videos/1",
      duration: "30m",
      createdAt: "2026-09-21T23:00:00.000Z",
    },
    markers: [
      { id: "m1", description: "First", positionSeconds: 60, url: "https://twitch.tv/1" },
      { id: "m2", description: "Second", positionSeconds: 120, url: "https://twitch.tv/2" },
      { id: "m3", description: "Third", positionSeconds: 180, url: "https://twitch.tv/3" },
      { id: "m4", description: "Fourth", positionSeconds: 240, url: "https://twitch.tv/4" },
    ],
    clips: [],
    updateCount: 0,
    summary: "Source-backed summary",
    generatedAt: "2026-09-21T23:31:00.000Z",
    sourceModel: "twitch-metadata",
    ...overrides,
  }
}

test("automatic Twitch VOD candidates are capped at three", () => {
  const candidates = selectAutomaticVodClipCandidates(summary())
  assert.deepEqual(candidates.map((item) => item.id), ["m1", "m2", "m3"])
})

test("automatic Twitch VOD candidates avoid existing clip offsets", () => {
  const input = summary({
    clips: [{
      id: "clip-1",
      title: "Existing",
      url: "https://clips.twitch.tv/clip-1",
      creatorName: "owner",
      viewCount: 0,
      createdAt: "2026-09-21T23:10:00.000Z",
      vodOffset: 61,
    }],
  })
  const candidates = selectAutomaticVodClipCandidates(input)
  assert.deepEqual(candidates.map((item) => item.id), ["m2", "m3"])
})

test("automatic Twitch VOD candidates require a VOD and valid marker offset", () => {
  assert.equal(selectAutomaticVodClipCandidates(summary({ vod: null })).length, 0)
  assert.equal(selectAutomaticVodClipCandidates(summary({
    markers: [{ id: "too-early", description: "Early", positionSeconds: 4, url: "https://twitch.tv/early" }],
  })).length, 0)
})
