import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import test from "node:test"

import {
  buildTwitchAuthorizationUrl,
  buildTwitchMetadataSummary,
  createTwitchOauthAttempt,
  processTwitchEventSubNotification,
  readTwitchOauthAttempt,
  resolveTwitchConfig,
  TWITCH_MEDIA_SCOPE,
  TWITCH_SCOPE,
  verifyTwitchEventSubSignature,
  type TwitchStreamSession,
} from "../lib/server/twitch-pilot"

function testEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    PUBLIC_APP_URL: "https://ams.example.test",
    NEXTAUTH_SECRET: "test-nextauth-secret-with-sufficient-length",
    AMS_TWITCH_CLIENT_ID: "client-123",
    AMS_TWITCH_CLIENT_SECRET: "secret-123",
    AMS_TWITCH_EVENTSUB_SECRET: "eventsub-secret-1234567890",
    AMS_CONNECTION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    UPSTASH_REDIS_REST_URL: "https://redis.example.test",
    UPSTASH_REDIS_REST_TOKEN: "redis-token",
  }
}

test("Twitch config is fail-closed and derives production callbacks", () => {
  assert.equal(resolveTwitchConfig({ NODE_ENV: "test" }), null)
  const config = resolveTwitchConfig(testEnv())
  assert.ok(config)
  assert.equal(config.redirectUri, "https://ams.example.test/api/internal/twitch/callback")
  assert.equal(config.eventSubCallback, "https://ams.example.test/api/twitch/eventsub")
})

test("Twitch OAuth attempt is signed, expiring, and uses only the read-only scope", () => {
  const env = testEnv()
  const now = Date.parse("2026-09-17T20:00:00.000Z")
  const attempt = createTwitchOauthAttempt(env, now)
  const parsed = readTwitchOauthAttempt(attempt.cookieValue, attempt.state, env, now + 1_000)
  assert.equal(parsed.state, attempt.state)

  const authUrl = buildTwitchAuthorizationUrl(attempt.state, env)
  assert.equal(authUrl.origin, "https://id.twitch.tv")
  assert.equal(authUrl.searchParams.get("scope"), TWITCH_SCOPE)
  assert.equal(TWITCH_SCOPE, "user:read:broadcast")
  assert.equal(authUrl.searchParams.get("response_type"), "code")

  assert.throws(
    () => readTwitchOauthAttempt(`${attempt.cookieValue}tampered`, attempt.state, env, now + 1_000),
    /TWITCH_OAUTH_STATE_INVALID/,
  )
  assert.throws(
    () => readTwitchOauthAttempt(attempt.cookieValue, attempt.state, env, now + 11 * 60 * 1000),
    /TWITCH_OAUTH_STATE_EXPIRED/,
  )
})

test("optional media OAuth adds only the Twitch clip-management scope", () => {
  const env = testEnv()
  const now = Date.parse("2026-09-18T23:30:00.000Z")
  const attempt = createTwitchOauthAttempt(env, now, "media")
  const parsed = readTwitchOauthAttempt(attempt.cookieValue, attempt.state, env, now + 1_000)
  assert.equal(parsed.capability, "media")

  const authUrl = buildTwitchAuthorizationUrl(attempt.state, env, true)
  const scopes = new Set((authUrl.searchParams.get("scope") ?? "").split(" ").filter(Boolean))
  assert.deepEqual(scopes, new Set([TWITCH_SCOPE, TWITCH_MEDIA_SCOPE]))
  assert.equal(authUrl.searchParams.get("force_verify"), "true")
  assert.equal(TWITCH_MEDIA_SCOPE, "channel:manage:clips")
})

test("EventSub signature verification rejects tampering and replay-age violations", () => {
  const secret = "eventsub-secret-1234567890"
  const messageId = "message-123"
  const timestamp = "2026-09-17T20:00:00.000Z"
  const rawBody = JSON.stringify({ subscription: { type: "stream.online" }, event: { id: "stream-1" } })
  const signature = `sha256=${createHmac("sha256", secret)
    .update(`${messageId}${timestamp}${rawBody}`)
    .digest("hex")}`

  assert.equal(
    verifyTwitchEventSubSignature(
      { messageId, timestamp, signature, rawBody },
      secret,
      Date.parse(timestamp) + 60_000,
    ),
    true,
  )
  assert.equal(
    verifyTwitchEventSubSignature(
      { messageId, timestamp, signature, rawBody: `${rawBody}x` },
      secret,
      Date.parse(timestamp) + 60_000,
    ),
    false,
  )
  assert.equal(
    verifyTwitchEventSubSignature(
      { messageId, timestamp, signature, rawBody },
      secret,
      Date.parse(timestamp) + 11 * 60_000,
    ),
    false,
  )
})

test("metadata summary stays explicit about its evidence boundary", () => {
  const session: TwitchStreamSession = {
    broadcasterId: "42",
    broadcasterLogin: "smokybanana03",
    broadcasterName: "SmokyBanana03",
    streamId: "stream-42",
    startedAt: "2026-09-17T20:00:00.000Z",
    endedAt: null,
    title: "Once Human sibling survival",
    categoryId: "game-1",
    categoryName: "Once Human",
    language: "en",
    updates: [],
  }
  const summary = buildTwitchMetadataSummary({
    session,
    endedAt: "2026-09-17T21:30:00.000Z",
    vod: {
      id: "2874355798",
      title: "Hiiii",
      url: "https://www.twitch.tv/videos/2874355798",
      duration: "1h30m",
      createdAt: "2026-09-17T20:00:00.000Z",
    },
    markers: [{ id: "m1", description: "clutch", positionSeconds: 600, url: "https://example.test/marker" }],
    clips: [{ id: "c1", title: "save", url: "https://clips.twitch.tv/example", creatorName: "viewer", viewCount: 3, createdAt: "2026-09-17T20:10:00.000Z" }],
    generatedAt: "2026-09-17T21:31:00.000Z",
  })

  assert.equal(summary.durationMinutes, 90)
  assert.equal(summary.sourceModel, "twitch-metadata")
  assert.match(summary.summary, /metadata, clips, and stream markers/)
  assert.match(summary.summary, /not visual analysis/i)
  assert.equal(summary.markers.length, 1)
  assert.equal(summary.clips.length, 1)
})


test("failed EventSub processing releases the message claim so Twitch can retry", async () => {
  const values = new Map<string, string>()
  const redis = {
    async set(key: string, value: string, options?: { nx?: boolean; ex?: number }) {
      if (options?.nx && values.has(key)) return null
      values.set(key, value)
      return "OK"
    },
    async get(key: string) {
      return values.get(key) ?? null
    },
    async del(...keys: string[]) {
      let removed = 0
      for (const key of keys) {
        if (values.delete(key)) removed += 1
      }
      return removed
    },
  }

  await assert.rejects(
    processTwitchEventSubNotification("{not-json", "retry-message", { redis: redis as never }),
  )

  const valid = JSON.stringify({
    subscription: { type: "test.noop", version: "1" },
    event: {},
  })
  const processed = await processTwitchEventSubNotification(valid, "retry-message", {
    redis: redis as never,
  })
  assert.equal(processed.duplicate, false)

  const duplicate = await processTwitchEventSubNotification(valid, "retry-message", {
    redis: redis as never,
  })
  assert.equal(duplicate.duplicate, true)
})
