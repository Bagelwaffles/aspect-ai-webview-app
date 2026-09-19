import assert from "node:assert/strict"
import test from "node:test"

import { buildTwitchMediaQueue, isMp4FileSignature, readTwitchMediaBody, reconcileTwitchMediaAuthorization } from "../lib/server/twitch-media-factory"
import type { StreamIntelligencePackage } from "../lib/server/stream-intelligence"
import type { TwitchPilotSummary } from "../lib/server/twitch-pilot"

function summary(): TwitchPilotSummary {
  return {
    broadcasterId: "155477801",
    broadcasterLogin: "smokybanana03",
    broadcasterName: "SmokyBanana03",
    streamId: "stream-cod-1",
    startedAt: "2026-09-18T23:25:00.000Z",
    endedAt: "2026-09-18T23:55:00.000Z",
    durationMinutes: 30,
    title: "COD test stream",
    categoryName: "Call of Duty",
    vod: {
      id: "vod-1",
      title: "COD test stream",
      url: "https://www.twitch.tv/videos/vod-1",
      duration: "30m",
      createdAt: "2026-09-18T23:25:00.000Z",
    },
    markers: [],
    clips: [
      {
        id: "clip-a",
        title: "Test clip A",
        url: "https://clips.twitch.tv/clip-a",
        creatorName: "viewer",
        viewCount: 1,
        createdAt: "2026-09-18T23:30:00.000Z",
        videoId: "vod-1",
        gameId: "cod",
        thumbnailUrl: "https://example.test/a.jpg",
        duration: 20,
        vodOffset: 300,
      },
      {
        id: "clip-b",
        title: "Test clip B",
        url: "https://clips.twitch.tv/clip-b",
        creatorName: "viewer",
        viewCount: 2,
        createdAt: "2026-09-18T23:31:00.000Z",
        videoId: "vod-1",
        gameId: "cod",
        thumbnailUrl: "https://example.test/b.jpg",
        duration: 30,
        vodOffset: 360,
      },
    ],
    updateCount: 1,
    summary: "Metadata-backed test summary.",
    generatedAt: "2026-09-18T23:56:00.000Z",
    sourceModel: "twitch-metadata",
  }
}

const intelligence: StreamIntelligencePackage = {
  streamId: "stream-cod-1",
  broadcasterLogin: "smokybanana03",
  phase: "post-stream",
  generatedAt: "2026-09-18T23:56:30.000Z",
  generationMode: "deterministic-fallback",
  model: "deterministic-v1",
  version: "stream-intelligence-v1",
  draft: {
    primarySearchPhrase: "Call of Duty gameplay stream",
    supportingKeywords: ["Call of Duty", "COD gameplay", "COD stream", "gaming highlights"],
    contentAngles: ["COD highlights", "SmokyBanana03 stream recap", "COD test clips"],
    twitch: {
      titleOptions: ["COD with SmokyBanana03", "Call of Duty Live", "COD Stream"],
      tagRecommendations: ["Call of Duty", "COD", "gaming"],
      goLiveCopy: "SmokyBanana03 is live with Call of Duty.",
    },
    youtube: {
      titleOptions: ["COD Gameplay | SmokyBanana03", "Call of Duty Highlights", "COD Full Stream"],
      description: "Metadata-backed Call of Duty stream.",
      tags: ["Call of Duty", "COD", "gaming", "stream", "highlights"],
      hashtags: ["#CallOfDuty", "#COD", "#gaming"],
    },
    shortForm: {
      hooks: ["COD got chaotic fast.", "This fight escalated.", "Wait for this play.", "COD timing is brutal.", "One more round."],
      captions: ["COD test clip one.", "COD test clip two.", "COD test clip three."],
      hashtags: ["#CallOfDuty", "#COD", "#Shorts"],
    },
    social: {
      tiktokCaption: "COD clip.",
      instagramCaption: "COD clip.",
      xPost: "COD clip.",
      discordAnnouncement: "COD clip ready.",
    },
    thumbnailText: ["COD CHAOS", "CLUTCH", "TEST CLIP"],
    approvalNotes: ["Review before publishing."],
    evidenceBoundary: "Metadata-backed only.",
  },
}

test("media queue creates one independent Shorts draft per discovered Twitch clip", () => {
  const queue = buildTwitchMediaQueue({
    summary: summary(),
    intelligence,
    broadcasterId: "155477801",
    broadcasterLogin: "smokybanana03",
    scopes: ["user:read:broadcast"],
    generatedAt: "2026-09-18T23:57:00.000Z",
  })

  assert.equal(queue.streamId, "stream-cod-1")
  assert.equal(queue.mediaAuthorized, false)
  assert.equal(queue.items.length, 2)
  assert.equal(queue.items[0].clipId, "clip-a")
  assert.equal(queue.items[1].clipId, "clip-b")
  assert.notEqual(queue.items[0].shortDraft.hook, queue.items[1].shortDraft.hook)
})

test("media queue recognizes clip permission and preserves prior imported media state", () => {
  const first = buildTwitchMediaQueue({
    summary: summary(),
    intelligence,
    broadcasterId: "155477801",
    broadcasterLogin: "smokybanana03",
    scopes: ["user:read:broadcast", "channel:manage:clips"],
    generatedAt: "2026-09-18T23:57:00.000Z",
  })
  const previous = {
    ...first,
    items: first.items.map((item, index) => index === 0
      ? {
          ...item,
          status: "short-ready" as const,
          orientation: "portrait" as const,
          objectKey: "creators/twitch/155477801/stream-cod-1/clips/clip-a/portrait.mp4",
          importedAt: "2026-09-18T23:58:00.000Z",
        }
      : item),
  }

  const refreshed = buildTwitchMediaQueue({
    summary: summary(),
    intelligence,
    broadcasterId: "155477801",
    broadcasterLogin: "smokybanana03",
    scopes: ["user:read:broadcast", "channel:manage:clips"],
    previous,
    generatedAt: "2026-09-18T23:59:00.000Z",
  })

  assert.equal(refreshed.mediaAuthorized, true)
  assert.equal(refreshed.items[0].status, "short-ready")
  assert.equal(refreshed.items[0].orientation, "portrait")
  assert.match(refreshed.items[0].objectKey ?? "", /portrait\.mp4$/)
})


test("status reconciliation fixes a stale media authorization flag after OAuth scope upgrade", () => {
  const stale = buildTwitchMediaQueue({
    summary: summary(),
    intelligence,
    broadcasterId: "155477801",
    broadcasterLogin: "smokybanana03",
    scopes: ["user:read:broadcast"],
    generatedAt: "2026-09-19T01:39:00.000Z",
  })
  assert.equal(stale.mediaAuthorized, false)

  const reconciled = reconcileTwitchMediaAuthorization(stale, [
    "user:read:broadcast",
    "channel:manage:clips",
  ])

  assert.ok(reconciled)
  assert.equal(reconciled.mediaAuthorized, true)
  assert.equal(reconciled.items.length, stale.items.length)
})


test("Twitch clip import validates MP4 bytes instead of trusting CDN MIME headers", () => {
  const mp4 = Uint8Array.from([
    0x00, 0x00, 0x00, 0x18,
    0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d,
  ])
  const html = new TextEncoder().encode("<!doctype html>")
  const short = Uint8Array.from([0x00, 0x00, 0x00, 0x18, 0x66])

  assert.equal(isMp4FileSignature(mp4), true)
  assert.equal(isMp4FileSignature(html), false)
  assert.equal(isMp4FileSignature(short), false)
})


test("Twitch media buffering enforces the byte ceiling before R2 upload", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(Uint8Array.from([1, 2, 3]))
      controller.enqueue(Uint8Array.from([4, 5, 6]))
      controller.close()
    },
  })

  await assert.rejects(
    () => readTwitchMediaBody(stream, 5),
    /TWITCH_MEDIA_SOURCE_TOO_LARGE/,
  )
})

test("Twitch media buffering preserves exact bytes for binary upload", async () => {
  const expected = Uint8Array.from([
    0x00, 0x00, 0x00, 0x18,
    0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d,
  ])
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(expected.slice(0, 5))
      controller.enqueue(expected.slice(5))
      controller.close()
    },
  })

  const actual = await readTwitchMediaBody(stream, 1024)
  assert.deepEqual(actual, expected)
  assert.equal(isMp4FileSignature(actual), true)
})
