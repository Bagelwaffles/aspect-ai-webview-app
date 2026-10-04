import assert from "node:assert/strict"
import test from "node:test"
import { claimTwitchVod, completeTwitchVod, beginTwitchVodUpload, getTwitchCatchupStatus, publishVerifiedTwitchVods, retryRemovedTwitchVod, retryCancelledTwitchVod, validateYouTubeSessionUrl, vodMetadata } from "../lib/server/twitch-catchup"

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

async function publisher(scenario: "normal" | "ambiguous" | "wrong-channel" | "processing" | "no-edit" | "processed" | "removed" = "normal") {
  const state = seeded()
  const key = "ams:twitch-catchup:v1:vod:123"
  const job = JSON.parse(state.data.get(key) as string)
  state.data.set(key, JSON.stringify({ ...job, status: "verified", youtubeVideoId: "abcdefghijk" }))
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", GOOGLE_CLIENT_ID: "google-client-12345678901234567890",
    GOOGLE_CLIENT_SECRET: "google-secret-12345678901234567890", NEXTAUTH_SECRET: "test-secret-with-enough-entropy-for-vod-promotion",
    AMS_OWNER_EMAIL: "owner@example.com", AMS_TWITCH_YOUTUBE_PUBLIC_AUTOPUBLISH: "true" }
  let privacy = "private", updates = 0, longUploads = "eligible"
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
    if (url.includes("/channels?")) return json({ items: [{ id: SMOKYBANANA03_YOUTUBE_CHANNEL_ID, snippet: { title: "SmokyBanana03" }, status: { longUploadsStatus: longUploads } }] })
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
    if (url.includes("/videos?") && scenario === "removed") return json({ items: [] })
    if (url.includes("/videos?")) return json({ items: [{ snippet: { ...job.metadata,
      channelId: scenario === "wrong-channel" ? "wrong" : SMOKYBANANA03_YOUTUBE_CHANNEL_ID },
      status: { privacyStatus: privacy, selfDeclaredMadeForKids: false, uploadStatus: scenario === "processed" ? "processed" : "uploaded" },
      processingDetails: { processingStatus: ["processing", "processed"].includes(scenario) ? "processing" : "succeeded" } }] })
    throw new Error("unexpected endpoint")
  }) as typeof fetch
  await storeYouTubeOwnerConnectionFromGoogle({ email: "owner@example.com", refreshToken: "test-refresh-token-12345678901234567890",
    accessToken: "initial-token", scopes: [YOUTUBE_UPLOAD_SCOPE, YOUTUBE_READONLY_SCOPE, ...(scenario === "no-edit" ? [] : [YOUTUBE_FORCE_SSL_SCOPE])] },
    { ...state, env, fetcher })
  return { ...state, env, fetcher, updates: () => updates, allowLong: () => { longUploads = "allowed" } }
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

test("provider processed status permits publication when detailed processing readback lags", async () => {
  const options = await publisher("processed")
  assert.equal((await publishVerifiedTwitchVods(options)).published, 1)
})
test("missing video requires reconciliation, never automatic duplicate upload", async () => {
  const options = await publisher("removed")
  assert.equal((await publishVerifiedTwitchVods(options)).published, 0)
  const job = (await getTwitchCatchupStatus(options)).jobs[0]
  assert.equal(job.status, "reconciliation")
  assert.equal(job.errorCode, "YOUTUBE_VOD_REMOVED_OR_UNAVAILABLE")
  assert.equal(await claimTwitchVod(options), null)
})
test("long recordings are blocked before rendering and automatically resume after channel verification", async () => {
  const options = await publisher()
  const key = "ams:twitch-catchup:v1:vod:123"
  const job = JSON.parse(options.data.get(key) as string)
  options.data.set(key, JSON.stringify({ ...job, status: "pending", youtubeVideoId: null, durationSeconds: 889 }))
  assert.equal(await claimTwitchVod(options), null)
  assert.equal((await getTwitchCatchupStatus(options)).jobs[0].status, "blocked")
  options.allowLong()
  const resumed = (await claimTwitchVod(options))!
  assert.equal(resumed.status, "rendering")
  assert.equal(resumed.errorCode, null)
})
test("eligibility is rechecked before upload session creation", async () => {
  const options = await publisher()
  const key = "ams:twitch-catchup:v1:vod:123"
  const job = JSON.parse(options.data.get(key) as string)
  options.data.set(key, JSON.stringify({ ...job, status: "pending", youtubeVideoId: null }))
  const claimed = (await claimTwitchVod(options))!
  options.data.set(key, JSON.stringify({ ...claimed, durationSeconds: 901 }))
  await assert.rejects(beginTwitchVodUpload({ vodId: "123", lease: claimed.lease!, bytes: 1234 }, options), /LONG_UPLOAD_VERIFICATION_REQUIRED/)
  assert.equal((await getTwitchCatchupStatus(options)).jobs[0].status, "rendering")
  await completeTwitchVod({ vodId: "123", lease: claimed.lease!, errorCode: "YOUTUBE_LONG_UPLOAD_VERIFICATION_REQUIRED" }, options)
  assert.equal((await getTwitchCatchupStatus(options)).jobs[0].status, "blocked")
  options.allowLong()
  assert.equal((await claimTwitchVod(options))?.status, "rendering")
})
test("removed-video retry requires owner confirmation and cannot replace an existing video", async () => {
  const options = await publisher()
  const key = "ams:twitch-catchup:v1:vod:123"
  const job = JSON.parse(options.data.get(key) as string)
  options.data.set(key, JSON.stringify({ ...job, errorCode: "YOUTUBE_VOD_PUBLIC_PROOF_FAILED" }))
  await assert.rejects(retryRemovedTwitchVod({ vodId: "123", videoId: "abcdefghijk", approved: false }, options), /APPROVAL_REQUIRED/)
  await assert.rejects(retryRemovedTwitchVod({ vodId: "123", videoId: "abcdefghijk", approved: true }, options), /RETRY_EXISTING_VIDEO/)
  const removed = await publisher("removed")
  await publishVerifiedTwitchVods(removed)
  await retryRemovedTwitchVod({ vodId: "123", videoId: "abcdefghijk", approved: true }, removed)
  const reset = (await getTwitchCatchupStatus(removed)).jobs[0]
  assert.equal(reset.status, "pending")
  assert.equal(reset.youtubeVideoId, null)
  assert.deepEqual(reset.previousYoutubeVideoIds, ["abcdefghijk"])
})

test("confirmed cancelled renderer can resume but upload sessions remain fenced", async () => {
  const state = seeded()
  const job = (await claimTwitchVod(state))!
  await assert.rejects(retryCancelledTwitchVod({ vodId: "123", approved: false }, state), /APPROVAL_REQUIRED/)
  await retryCancelledTwitchVod({ vodId: "123", approved: true }, state)
  assert.equal((await claimTwitchVod(state))?.status, "rendering")
  state.data.set("ams:twitch-catchup:v1:vod:123", JSON.stringify({ ...job, status: "uploading" }))
  await assert.rejects(retryCancelledTwitchVod({ vodId: "123", approved: true }, state), /CANCELLED_RETRY_NOT_ALLOWED/)
})


test("pre-upload vault failures can resume but upload ambiguity cannot", async () => {
  const options = await publisher()
  options.allowLong()
  const key = "ams:twitch-catchup:v1:vod:123"
  const job = JSON.parse(options.data.get(key) as string)
  options.data.set(key, JSON.stringify({ ...job, durationSeconds: 950, status: "failed", lease: "old-lease", youtubeVideoId: null, errorCode: "YOUTUBE_CONNECTION_VAULT_UNAVAILABLE" }))
  options.data.set(key + ":lock", "old-lease")
  const resumed = await claimTwitchVod(options)
  assert.equal(resumed?.status, "rendering")
  assert.notEqual(resumed?.lease, "old-lease")
  options.data.set(key, JSON.stringify({ ...resumed, status: "reconciliation", errorCode: "YOUTUBE_CONNECTION_VAULT_UNAVAILABLE" }))
  assert.equal(await claimTwitchVod(options), null)
})

test("production upload initiation resolves the configured Redis vault when no store is injected", async () => {
  const options = await publisher()
  options.allowLong()
  const key = "ams:twitch-catchup:v1:vod:123"
  const job = JSON.parse(options.data.get(key) as string)
  options.data.set(key, JSON.stringify({ ...job, durationSeconds: 950, status: "pending", youtubeVideoId: null }))
  const claimed = (await claimTwitchVod(options))!
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    assert.equal(new URL(String(input)).hostname, "redis.example.test")
    const commands = JSON.parse(String(init?.body))
    const execute = ([command, name, value]: string[]) => ({ result: command.toLowerCase() === "get" ? options.data.get(name) ?? null : (options.data.set(name, value), "OK") })
    return Response.json(Array.isArray(commands[0]) ? commands.map(execute) : execute(commands))
  }
  try {
    const result = await beginTwitchVodUpload({ vodId: "123", lease: claimed.lease!, bytes: 1234 }, {
      env: { ...options.env, UPSTASH_REDIS_REST_URL: "https://redis.example.test", UPSTASH_REDIS_REST_TOKEN: "test-redis" },
      fetcher: async (input, init) => String(input).includes("/upload/") ? new Response(null, { status: 200, headers: { location: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=test" } }) : options.fetcher(input, init),
    })
    assert.match(result.uploadUrl, /upload_id=test/)
  } finally { globalThis.fetch = originalFetch }
})
