import assert from "node:assert/strict"
import test from "node:test"
import { claimTwitchVod, completeTwitchVod, beginTwitchVodUpload, getTwitchCatchupStatus, publishVerifiedTwitchVods, validateYouTubeSessionUrl, vodMetadata } from "../lib/server/twitch-catchup"

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

import { storeYouTubeOwnerConnectionFromGoogle, SMOKYBANANA03_YOUTUBE_CHANNEL_ID, YOUTUBE_FORCE_SSL_SCOPE, YOUTUBE_READONLY_SCOPE, YOUTUBE_UPLOAD_SCOPE } from "../lib/server/youtube-owner-connection"

async function publisher(scenario: "normal" | "ambiguous" | "wrong-channel" | "processing" | "no-edit" = "normal") {
  const state = seeded()
  const key = "ams:twitch-catchup:v1:vod:123"
  const job = JSON.parse(state.data.get(key) as string)
  state.data.set(key, JSON.stringify({ ...job, status: "verified", youtubeVideoId: "abcdefghijk" }))
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", GOOGLE_CLIENT_ID: "google-client-12345678901234567890",
    GOOGLE_CLIENT_SECRET: "google-secret-12345678901234567890", NEXTAUTH_SECRET: "test-secret-with-enough-entropy-for-vod-promotion",
    AMS_OWNER_EMAIL: "owner@example.com", AMS_TWITCH_YOUTUBE_PUBLIC_AUTOPUBLISH: "true" }
  let privacy = "private", updates = 0
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
    if (url.includes("/channels?")) return json({ items: [{ id: SMOKYBANANA03_YOUTUBE_CHANNEL_ID, snippet: { title: "SmokyBanana03" } }] })
    if (url.includes("/token")) return json({ access_token: "test-access-token" })
    if (init?.method === "PUT") {
      updates++
      const body = JSON.parse(String(init.body))
      assert.equal(body.id, "abcdefghijk")
      assert.equal(body.status.privacyStatus, "public")
      assert.equal(body.status.selfDeclaredMadeForKids, false)
      privacy = "public"
      if (scenario === "ambiguous") throw new Error("transport timeout")
      return json({ id: body.id })
    }
    if (url.includes("/videos?")) return json({ items: [{ snippet: { ...job.metadata,
      channelId: scenario === "wrong-channel" ? "wrong" : SMOKYBANANA03_YOUTUBE_CHANNEL_ID },
      status: { privacyStatus: privacy, selfDeclaredMadeForKids: false },
      processingDetails: { processingStatus: scenario === "processing" ? "processing" : "succeeded" } }] })
    throw new Error("unexpected endpoint")
  }) as typeof fetch
  await storeYouTubeOwnerConnectionFromGoogle({ email: "owner@example.com", refreshToken: "test-refresh-token-12345678901234567890",
    accessToken: "initial-token", scopes: [YOUTUBE_UPLOAD_SCOPE, YOUTUBE_READONLY_SCOPE, ...(scenario === "no-edit" ? [] : [YOUTUBE_FORCE_SSL_SCOPE])] },
    { ...state, env, fetcher })
  return { ...state, env, fetcher, updates: () => updates }
}
test("verified full VODs publish the existing video once and verify Public", async () => {
  const options = await publisher()
  assert.equal((await publishVerifiedTwitchVods(options)).published, 1)
  assert.equal((await getTwitchCatchupStatus(options)).jobs[0].status, "published")
  await publishVerifiedTwitchVods(options)
  assert.equal(options.updates(), 1)
})
test("ambiguous public update reconciles by read-back without repeating the update", async () => {
  const options = await publisher("ambiguous")
  assert.equal((await publishVerifiedTwitchVods(options)).published, 0)
  assert.equal((await getTwitchCatchupStatus(options)).jobs[0].status, "verified")
  assert.equal((await publishVerifiedTwitchVods(options)).published, 1)
  assert.equal(options.updates(), 1)
})
test("disabled publishing, wrong channel and unfinished processing cannot publish", async () => {
  for (const scenario of ["wrong-channel", "processing"] as const) {
    const options = await publisher(scenario)
    assert.equal((await publishVerifiedTwitchVods(options)).published, 0)
    assert.equal(options.updates(), 0)
  }
  const options = await publisher()
  options.env.AMS_TWITCH_YOUTUBE_PUBLIC_AUTOPUBLISH = "false"
  assert.equal((await publishVerifiedTwitchVods(options)).published, 0)
  assert.equal(options.updates(), 0)
})
test("public VOD promotion requires an owner edit scope", async () => {
  const options = await publisher("no-edit")
  await assert.rejects(publishVerifiedTwitchVods(options), /EDIT_SCOPE_REQUIRED/)
  assert.equal(options.updates(), 0)
})
