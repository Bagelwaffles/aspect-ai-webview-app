import assert from "node:assert/strict"
import test from "node:test"

import {
  selectAutomaticVodClipCandidates,
  selectDailyVodSampleCandidates,
} from "../lib/server/twitch-auto-factory"
import type {
  TwitchPilotSummary,
  TwitchRecentClip,
  TwitchRecentVod,
} from "../lib/server/twitch-pilot"

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

test("automatic Twitch VOD candidates require a VOD", () => {
  assert.equal(selectAutomaticVodClipCandidates(summary({ vod: null })).length, 0)
})

test("automatic Twitch VOD candidates fall back to sampled VOD positions when clips and markers are absent", () => {
  const candidates = selectAutomaticVodClipCandidates(summary({
    durationMinutes: 3,
    markers: [],
    clips: [],
  }))
  assert.equal(candidates.length, 3)
  assert.deepEqual(candidates.map((item) => item.source), ["sample", "sample", "sample"])
  assert.deepEqual(candidates.map((item) => item.positionSeconds), [45, 90, 135])
})

test("automatic Twitch VOD sampling stays bounded for short completed streams", () => {
  const candidates = selectAutomaticVodClipCandidates(summary({
    durationMinutes: 1,
    markers: [],
    clips: [],
  }))
  assert.equal(candidates.length, 3)
  assert.ok(candidates.every((item) => item.positionSeconds >= 10 && item.positionSeconds <= 55))
})


test("daily Twitch sweep creates three samples for each VOD with no existing clips", () => {
  const vod: TwitchRecentVod = {
    id: "vod-day-1",
    streamId: "stream-day-1",
    title: "Morning COD stream",
    url: "https://www.twitch.tv/videos/day-1",
    createdAt: "2026-09-22T12:00:00.000Z",
    duration: "1h",
    durationSeconds: 3600,
  }
  const candidates = selectDailyVodSampleCandidates(vod, [])
  assert.deepEqual(candidates.map((item) => item.positionSeconds), [900, 1800, 2700])
})

test("daily Twitch sweep counts existing clips per VOD and only fills missing slots", () => {
  const vod: TwitchRecentVod = {
    id: "vod-day-2",
    streamId: "stream-day-2",
    title: "Afternoon COD stream",
    url: "https://www.twitch.tv/videos/day-2",
    createdAt: "2026-09-22T17:00:00.000Z",
    duration: "30m",
    durationSeconds: 1800,
  }
  const clips: TwitchRecentClip[] = [{
    id: "existing-1",
    title: "Manual clip",
    url: "https://clips.twitch.tv/existing-1",
    creatorName: "SmokyBanana03",
    viewCount: 0,
    createdAt: "2026-09-22T17:10:00.000Z",
    videoId: "vod-day-2",
    vodOffset: 600,
  }]
  const candidates = selectDailyVodSampleCandidates(vod, clips)
  assert.equal(candidates.length, 2)
})

test("daily Twitch sweep does not let clips from another VOD consume this VOD's quota", () => {
  const vod: TwitchRecentVod = {
    id: "vod-day-3",
    streamId: "stream-day-3",
    title: "Evening stream",
    url: "https://www.twitch.tv/videos/day-3",
    createdAt: "2026-09-22T22:00:00.000Z",
    duration: "20m",
    durationSeconds: 1200,
  }
  const clips: TwitchRecentClip[] = [{
    id: "other-vod-clip",
    title: "Other stream clip",
    url: "https://clips.twitch.tv/other",
    creatorName: "SmokyBanana03",
    viewCount: 0,
    createdAt: "2026-09-22T20:00:00.000Z",
    videoId: "vod-other",
    vodOffset: 300,
  }]
  assert.equal(selectDailyVodSampleCandidates(vod, clips).length, 3)
})
