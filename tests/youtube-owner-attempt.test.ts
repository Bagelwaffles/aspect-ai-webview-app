import assert from "node:assert/strict"
import test from "node:test"
import { createYouTubeOwnerAttempt, consumeYouTubeOwnerAttempt } from "../lib/server/youtube-owner-attempt"
import {
  storeYouTubeOwnerConnectionFromGoogle, getYouTubeOwnerConnectionStatus,
  SMOKYBANANA03_YOUTUBE_CHANNEL_ID, YOUTUBE_UPLOAD_SCOPE, YOUTUBE_READONLY_SCOPE,
} from "../lib/server/youtube-owner-connection"

class MemoryRedis {
  values = new Map<string, string>()
  async set(key: string, value: string) { this.values.set(key, value); return "OK" }
  async get<T>(key: string) { return (this.values.get(key) ?? null) as T | null }
  async getdel<T>(key: string) {
    const value = this.values.get(key) ?? null
    this.values.delete(key)
    return value as T | null
  }
}
const env: NodeJS.ProcessEnv = {
  NEXTAUTH_SECRET: "test-owner-attempt-secret-with-sufficient-length",
  AMS_OWNER_EMAIL: "owner@example.com",
  GOOGLE_CLIENT_ID: "test-client-id", GOOGLE_CLIENT_SECRET: "test-client-secret",
}
const identity = { email: "owner@example.com", providerSubject: "google-owner-subject" }

test("owner attempt rejects non-owner creation and missing/forged callbacks", async () => {
  const redis = new MemoryRedis()
  await assert.rejects(createYouTubeOwnerAttempt({ ...identity, email: "other@example.com" }, { env, redis }), /YOUTUBE_OWNER_REQUIRED/u)
  await assert.rejects(consumeYouTubeOwnerAttempt(undefined, { env, redis }), /YOUTUBE_OWNER_ATTEMPT_REQUIRED/u)
  const attempt = await createYouTubeOwnerAttempt(identity, { env, redis })
  const [payload, mac] = attempt.split(".")
  const forged = Buffer.from(JSON.stringify({ email: "other@example.com" })).toString("base64url")
  await assert.rejects(consumeYouTubeOwnerAttempt(forged + "." + mac, { env, redis }), /YOUTUBE_OWNER_ATTEMPT_INVALID/u)
  assert.ok(payload)
})

test("owner attempt preserves original subject, rejects replay, expiration and owner changes", async () => {
  const redis = new MemoryRedis()
  const attempt = await createYouTubeOwnerAttempt(identity, { env, redis, now: () => 1000000 })
  await assert.rejects(consumeYouTubeOwnerAttempt(attempt, { env: { ...env, AMS_OWNER_EMAIL: "other@example.com" }, redis, now: () => 1000001 }), /YOUTUBE_OWNER_REQUIRED/u)
  assert.deepEqual(await consumeYouTubeOwnerAttempt(attempt, { env, redis, now: () => 1000001 }), identity)
  await assert.rejects(consumeYouTubeOwnerAttempt(attempt, { env, redis, now: () => 1000002 }), /YOUTUBE_OWNER_ATTEMPT_REPLAYED/u)
  const expired = await createYouTubeOwnerAttempt(identity, { env, redis, now: () => 1000000 })
  await assert.rejects(consumeYouTubeOwnerAttempt(expired, { env, redis, now: () => 1600000 }), /YOUTUBE_OWNER_ATTEMPT_EXPIRED/u)
})

test("concurrent owner callbacks consume the attempt once", async () => {
  const redis = new MemoryRedis()
  const attempt = await createYouTubeOwnerAttempt(identity, { env, redis })
  const results = await Promise.allSettled([
    consumeYouTubeOwnerAttempt(attempt, { env, redis }),
    consumeYouTubeOwnerAttempt(attempt, { env, redis }),
  ])
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1)
})

test("owner-initiated brand grant still requires exact channel and encrypted storage", async () => {
  const redis = new MemoryRedis()
  const attempt = await createYouTubeOwnerAttempt(identity, { env, redis })
  const owner = await consumeYouTubeOwnerAttempt(attempt, { env, redis })
  const refreshToken = "test-brand-refresh-token-with-enough-length"
  const input = { email: owner.email, refreshToken, accessToken: "test-brand-access-token", scopes: [YOUTUBE_UPLOAD_SCOPE, YOUTUBE_READONLY_SCOPE] }
  const channelFetcher = (channel: string) => (async () => new Response(JSON.stringify({
    items: [{ id: channel, snippet: { title: "SmokyBanana03" } }],
  }), { status: 200 })) as typeof fetch
  await assert.rejects(storeYouTubeOwnerConnectionFromGoogle(input, {
    env, redis, fetcher: channelFetcher("UC0000000000000000000000"),
  }), /YOUTUBE_CHANNEL_MISMATCH/u)
  assert.equal((await getYouTubeOwnerConnectionStatus({ env, redis })).connected, false)
  await storeYouTubeOwnerConnectionFromGoogle(input, {
    env, redis, fetcher: channelFetcher(SMOKYBANANA03_YOUTUBE_CHANNEL_ID),
  })
  assert.equal((await getYouTubeOwnerConnectionStatus({ env, redis })).connection?.channelId, SMOKYBANANA03_YOUTUBE_CHANNEL_ID)
  assert.equal([...redis.values.values()].join("").includes(refreshToken), false)
})
