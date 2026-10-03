import assert from "node:assert/strict"
import test from "node:test"
import { claimTwitchVod, completeTwitchVod, beginTwitchVodUpload, getTwitchCatchupStatus, validateYouTubeSessionUrl, vodMetadata } from "../lib/server/twitch-catchup"

function store() {
  const data = new Map<string, unknown>()
  const redis = {
    async get(key: string) { return data.get(key) ?? null },
    async set(key: string, value: unknown, options?: { nx?: boolean }) {
      if (options?.nx && data.has(key)) return null
      data.set(key, value); return "OK"
    },
    async del(key: string) { return Number(data.delete(key)) },
  }
  return { data, redis: redis as never }
}
function seeded() {
  const state = store()
  state.data.set("ams:twitch-catchup:v1:index", JSON.stringify(["123"]))
  state.data.set("ams:twitch-catchup:v1:vod:123", JSON.stringify({ vodId: "123", streamer: "SmokyBanana03", title: "Game",
    createdAt: "2026-10-03T20:00:00.000Z", durationSeconds: 60, status: "pending", lease: null, youtubeVideoId: null,
    errorCode: null, metadata: vodMetadata({ id: "123", title: "Game", createdAt: "2026-10-03T20:00:00.000Z" }) }))
  return state
}
test("full VOD metadata identifies the streamer, recording date, source and AMS", () => {
  const metadata = vodMetadata({ id: "123", title: "x".repeat(1000), createdAt: "2026-10-03T20:00:00.000Z" })
  assert.ok(metadata.title.startsWith("SmokyBanana03 | 2026-10-03 | Full Stream"))
  assert.equal(metadata.title.length, 100)
  assert.ok(metadata.description.includes("Created by Aspect Marketing Solutions (AMS)"))
  assert.ok(metadata.description.includes("https://www.twitch.tv/videos/123"))
})
test("upload session URL is constrained to Google's YouTube upload endpoint", () => {
  const valid = "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=test"
  assert.equal(validateYouTubeSessionUrl(valid), valid)
  for (const value of ["http://www.googleapis.com/upload/youtube/v3/videos?upload_id=x", "https://evil.test/upload/youtube/v3/videos?upload_id=x",
    "https://www.googleapis.com.evil.test/upload/youtube/v3/videos?upload_id=x", "https://www.googleapis.com/other?upload_id=x",
    "https://www.googleapis.com/upload/youtube/v3/videos"]) assert.throws(() => validateYouTubeSessionUrl(value))
})
test("concurrent claims cannot acquire the same full VOD", async () => {
  const state = seeded()
  const results = await Promise.all([claimTwitchVod(state), claimTwitchVod(state)])
  assert.equal(results.filter(Boolean).length, 1)
  assert.equal(results.find(Boolean)?.status, "rendering")
})
test("invalid lease and oversized input fail before contacting providers", async () => {
  const state = seeded()
  await assert.rejects(completeTwitchVod({ vodId: "123", lease: "bad", errorCode: "FAIL" }, state), /LEASE_INVALID/)
  await assert.rejects(beginTwitchVodUpload({ vodId: "123", lease: "bad", bytes: 256 * 1024 ** 3 + 1 }, state), /SIZE_INVALID/)
})
test("uncertain upload is fenced from a duplicate claim or upload session", async () => {
  const state = seeded()
  const job = (await claimTwitchVod(state))!
  state.data.set("ams:twitch-catchup:v1:vod:123", JSON.stringify({ ...job, status: "uploading" }))
  await completeTwitchVod({ vodId: "123", lease: job.lease!, errorCode: "NETWORK_FAILED" }, state)
  const status = await getTwitchCatchupStatus(state)
  assert.equal(status.jobs[0].status, "reconciliation")
  assert.equal(await claimTwitchVod(state), null)
  await assert.rejects(beginTwitchVodUpload({ vodId: "123", lease: job.lease!, bytes: 123 }, state), /RECONCILIATION_REQUIRED/)
})
