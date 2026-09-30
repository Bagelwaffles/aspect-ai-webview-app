import assert from "node:assert/strict"
import test from "node:test"

import {
  getStoredYouTubeOwnerCredential,
  getYouTubeOwnerConnectionStatus,
  SMOKYBANANA03_YOUTUBE_CHANNEL_ID,
  storeYouTubeOwnerConnectionFromGoogle,
  YOUTUBE_READONLY_SCOPE,
  YOUTUBE_UPLOAD_SCOPE,
} from "../lib/server/youtube-owner-connection"

class MemoryRedis {
  values = new Map<string, string>()

  async get<T>(key: string): Promise<T | null> {
    return (this.values.get(key) ?? null) as T | null
  }

  async set(key: string, value: string): Promise<unknown> {
    this.values.set(key, value)
    return "OK"
  }

  async del(...keys: string[]): Promise<unknown> {
    for (const key of keys) this.values.delete(key)
    return keys.length
  }
}

function env(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    GOOGLE_CLIENT_ID: "google-client-12345678901234567890",
    GOOGLE_CLIENT_SECRET: "google-secret-12345678901234567890",
    NEXTAUTH_SECRET: "nextauth-secret-with-enough-entropy-for-tests",
    AMS_OWNER_EMAIL: "owner@example.com",
    ...overrides,
  }
}

function scopes() {
  return [
    "openid",
    "email",
    "profile",
    YOUTUBE_UPLOAD_SCOPE,
    YOUTUBE_READONLY_SCOPE,
  ]
}

function channelFetcher(channelId: string = SMOKYBANANA03_YOUTUBE_CHANNEL_ID) {
  return (async (input: URL | RequestInfo) => {
    const url = String(input)
    if (url.startsWith("https://www.googleapis.com/youtube/v3/channels?")) {
      return new Response(
        JSON.stringify({
          items: [{ id: channelId, snippet: { title: "SmokyBanana03" } }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      )
    }
    throw new Error(`unexpected_fetch:${url}`)
  }) as typeof fetch
}

test("owner YouTube OAuth encrypts the refresh token and verifies the exact channel", async () => {
  const redis = new MemoryRedis()
  const refreshToken = "refresh-token-owner-12345678901234567890"

  const connection = await storeYouTubeOwnerConnectionFromGoogle(
    {
      email: "Owner@Example.com",
      refreshToken,
      accessToken: "access-token-owner-1234567890",
      scopes: scopes(),
    },
    {
      env: env(),
      redis,
      fetcher: channelFetcher(),
      now: () => new Date("2026-09-30T23:30:00.000Z"),
    },
  )

  assert.equal(connection.channelId, SMOKYBANANA03_YOUTUBE_CHANNEL_ID)
  assert.equal(connection.channelTitle, "SmokyBanana03")

  const serialized = [...redis.values.values()].join("\n")
  assert.equal(serialized.includes(refreshToken), false)

  const stored = await getStoredYouTubeOwnerCredential({
    env: env(),
    redis,
  })
  assert.equal(stored?.refreshToken, refreshToken)
  assert.equal(stored?.channelId, SMOKYBANANA03_YOUTUBE_CHANNEL_ID)

  const status = await getYouTubeOwnerConnectionStatus({
    env: env(),
    redis,
  })
  assert.equal(status.connected, true)
  assert.equal(status.connection?.channelId, SMOKYBANANA03_YOUTUBE_CHANNEL_ID)
})

test("owner YouTube OAuth rejects a non-owner Google account", async () => {
  await assert.rejects(
    storeYouTubeOwnerConnectionFromGoogle(
      {
        email: "someone@example.com",
        refreshToken: "refresh-token-other-12345678901234567890",
        accessToken: "access-token-other-1234567890",
        scopes: scopes(),
      },
      {
        env: env(),
        redis: new MemoryRedis(),
        fetcher: channelFetcher(),
      },
    ),
    /YOUTUBE_OWNER_REQUIRED/u,
  )
})

test("owner YouTube OAuth rejects grants without both upload and read-only scopes", async () => {
  await assert.rejects(
    storeYouTubeOwnerConnectionFromGoogle(
      {
        email: "owner@example.com",
        refreshToken: "refresh-token-owner-12345678901234567890",
        accessToken: "access-token-owner-1234567890",
        scopes: [YOUTUBE_UPLOAD_SCOPE],
      },
      {
        env: env(),
        redis: new MemoryRedis(),
        fetcher: channelFetcher(),
      },
    ),
    /YOUTUBE_REQUIRED_SCOPES_MISSING/u,
  )
})

test("owner YouTube OAuth refuses a different YouTube channel", async () => {
  await assert.rejects(
    storeYouTubeOwnerConnectionFromGoogle(
      {
        email: "owner@example.com",
        refreshToken: "refresh-token-owner-12345678901234567890",
        accessToken: "access-token-owner-1234567890",
        scopes: scopes(),
      },
      {
        env: env(),
        redis: new MemoryRedis(),
        fetcher: channelFetcher("UC0000000000000000000000"),
      },
    ),
    /YOUTUBE_CHANNEL_MISMATCH/u,
  )
})
