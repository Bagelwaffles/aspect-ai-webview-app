import assert from "node:assert/strict"
import test from "node:test"

import {
  getYouTubePublicPromotionRecord,
  promoteRenderedTwitchShortPublic,
} from "../lib/server/youtube-public-promoter"
import {
  twitchShortRenderJobSchema,
  type TwitchShortRenderJob,
} from "../lib/server/twitch-short-render-jobs"
import {
  SMOKYBANANA03_YOUTUBE_CHANNEL_ID,
  storeYouTubeOwnerConnectionFromGoogle,
  YOUTUBE_FORCE_SSL_SCOPE,
  YOUTUBE_READONLY_SCOPE,
  YOUTUBE_UPLOAD_SCOPE,
} from "../lib/server/youtube-owner-connection"

class MemoryRedis {
  private values = new Map<string, string>()

  async get<T>(key: string): Promise<T | null> {
    const value = this.values.get(key)
    return (value ?? null) as T | null
  }

  async set(key: string, value: unknown): Promise<unknown> {
    this.values.set(key, String(value))
    return "OK"
  }
}

function env(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    GOOGLE_CLIENT_ID: "google-client-12345678901234567890",
    GOOGLE_CLIENT_SECRET: "google-secret-12345678901234567890",
    NEXTAUTH_SECRET: "nextauth-secret-with-enough-entropy-for-public-promotion-tests",
    AMS_OWNER_EMAIL: "owner@example.com",
    AMS_TWITCH_YOUTUBE_PUBLIC_AUTOPUBLISH: "true",
    ...overrides,
  }
}

function renderedJob(): TwitchShortRenderJob {
  const now = "2026-10-03T20:00:00.000Z"
  return twitchShortRenderJobSchema.parse({
    version: "twitch-short-render-v1",
    jobId: "render-job-public-123",
    streamId: "day-2026-10-03",
    broadcasterId: "broadcaster-123",
    clipId: "clip-public-123",
    autoPublish: {
      sourceVideoId: "vod-123",
      rank: 1,
      selectedAt: now,
    },
    sourceObjectKey: "source.mp4",
    outputObjectKey: "short.mp4",
    status: "rendered",
    attempts: 1,
    createdAt: now,
    updatedAt: now,
    claimedAt: now,
    completedAt: now,
    errorCode: null,
    shortDraft: {
      title: "Best stream moment",
      hook: "Best stream moment",
      caption: "Strong gameplay moment.",
      hashtags: ["#SmokyBanana03", "#Gaming", "#Shorts"],
    },
    videoAnalysis: {
      version: "twitch-video-analysis-v3",
      analyzedAt: now,
      model: "google/gemini-2.5-flash",
      score: 91,
      recommendation: "render",
      reason: "Top ranked moment.",
      bestStartSeconds: 2,
      bestEndSeconds: 21,
    },
    publishMetadata: {
      title: "Best stream moment",
      description: "Actual Twitch footage from SmokyBanana03.",
      tags: ["gaming", "twitch", "shorts"],
      hashtags: ["#SmokyBanana03", "#Gaming", "#Shorts"],
      keywords: ["gaming", "twitch", "shorts"],
      categoryLabel: "Gaming",
      twitchClipTitle: "Best stream moment",
      youtube: {
        title: "Best stream moment",
        description: "Actual Twitch footage from SmokyBanana03. #Gaming #Shorts",
        tags: ["gaming", "twitch", "shorts"],
        hashtags: ["#SmokyBanana03", "#Gaming", "#Shorts"],
      },
      tiktok: {
        caption: "Best stream moment",
        hashtags: ["#SmokyBanana03", "#Gaming", "#Twitch"],
      },
      instagram: {
        caption: "Best stream moment",
        hashtags: ["#SmokyBanana03", "#Gaming", "#Twitch"],
      },
      x: { post: "Best stream moment #Gaming" },
    },
  })
}

async function seedVerifiedPrivateUpload(redis: MemoryRedis) {
  const now = "2026-10-03T20:00:00.000Z"
  await redis.set("ams:youtube-private-upload:v1:job:render-job-public-123", JSON.stringify({
    version: "youtube-private-upload-v1",
    renderJobId: "render-job-public-123",
    clipId: "clip-public-123",
    status: "succeeded",
    privacyStatus: "private",
    youtubeVideoId: "youtube-public-test-123",
    channelId: SMOKYBANANA03_YOUTUBE_CHANNEL_ID,
    attempts: 1,
    createdAt: now,
    updatedAt: now,
    completedAt: now,
    errorCode: null,
  }))
  await redis.set("ams:youtube-private-upload:v1:verification:render-job-public-123", JSON.stringify({
    renderJobId: "render-job-public-123",
    videoId: "youtube-public-test-123",
    channelId: SMOKYBANANA03_YOUTUBE_CHANNEL_ID,
    privacyStatus: "private",
    metadataVerified: true,
    categoryId: "20",
    expectedTagCount: 3,
    storedTagCount: 3,
    tagVerification: "exact",
    notifySubscribers: false,
    notificationEvidence: "upload-request-policy",
    verificationSource: "youtube-data-api",
    verifiedAt: now,
  }))
}

test("public promotion remains disabled unless the explicit production flag is true", async () => {
  await assert.rejects(
    promoteRenderedTwitchShortPublic(
      { renderJobId: "render-job-public-123", approved: true },
      {
        env: env({ AMS_TWITCH_YOUTUBE_PUBLIC_AUTOPUBLISH: "false" }),
        redis: new MemoryRedis() as never,
        getRenderJob: async () => renderedJob(),
      },
    ),
    /YOUTUBE_PUBLIC_AUTOPUBLISH_DISABLED/u,
  )
})

test("verified private Short is promoted public exactly once and preserves mutable status fields", async () => {
  const redis = new MemoryRedis()
  await seedVerifiedPrivateUpload(redis)

  let videoReadCount = 0
  const calls: Array<{ url: string; method: string; body: string }> = []
  const fetcher = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    const body = typeof init?.body === "string"
      ? init.body
      : init?.body instanceof URLSearchParams
        ? init.body.toString()
        : ""
    calls.push({ url, method, body })

    if (url.startsWith("https://www.googleapis.com/youtube/v3/channels?")) {
      return new Response(JSON.stringify({
        items: [{ id: SMOKYBANANA03_YOUTUBE_CHANNEL_ID, snippet: { title: "SmokyBanana03" } }],
      }), { status: 200, headers: { "content-type": "application/json" } })
    }

    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({ access_token: "public-access-token-123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }

    if (url.startsWith("https://www.googleapis.com/youtube/v3/videos?part=id%2Csnippet%2Cstatus")) {
      videoReadCount += 1
      return new Response(JSON.stringify({
        items: [{
          id: "youtube-public-test-123",
          snippet: { channelId: SMOKYBANANA03_YOUTUBE_CHANNEL_ID },
          status: {
            privacyStatus: videoReadCount === 1 ? "private" : "public",
            embeddable: true,
            license: "youtube",
            publicStatsViewable: true,
            selfDeclaredMadeForKids: false,
            containsSyntheticMedia: false,
          },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } })
    }

    if (url === "https://www.googleapis.com/youtube/v3/videos?part=status" && method === "PUT") {
      return new Response(JSON.stringify({
        id: "youtube-public-test-123",
        status: { privacyStatus: "public" },
      }), { status: 200, headers: { "content-type": "application/json" } })
    }

    return new Response("not found", { status: 404 })
  }) as typeof fetch

  await storeYouTubeOwnerConnectionFromGoogle({
    email: "owner@example.com",
    refreshToken: "public-refresh-token-12345678901234567890",
    accessToken: "initial-owner-access-token",
    scopes: [YOUTUBE_UPLOAD_SCOPE, YOUTUBE_READONLY_SCOPE, YOUTUBE_FORCE_SSL_SCOPE],
  }, {
    env: env(),
    redis: redis as never,
    fetcher,
  })

  const options = {
    env: env(),
    redis: redis as never,
    fetcher,
    now: () => new Date("2026-10-03T20:05:00.000Z"),
    getRenderJob: async () => renderedJob(),
  }

  const first = await promoteRenderedTwitchShortPublic(
    { renderJobId: "render-job-public-123", approved: true },
    options,
  )
  assert.equal(first.reused, false)
  assert.equal(first.record.status, "succeeded")
  assert.equal(first.record.sourceVideoId, "vod-123")
  assert.equal(first.record.selectionRank, 1)
  assert.equal(first.record.channelId, SMOKYBANANA03_YOUTUBE_CHANNEL_ID)

  const update = calls.find((call) =>
    call.url === "https://www.googleapis.com/youtube/v3/videos?part=status" &&
    call.method === "PUT",
  )
  assert.ok(update)
  const updateBody = JSON.parse(update.body)
  assert.equal(updateBody.id, "youtube-public-test-123")
  assert.equal(updateBody.status.privacyStatus, "public")
  assert.equal(updateBody.status.embeddable, true)
  assert.equal(updateBody.status.license, "youtube")
  assert.equal(updateBody.status.publicStatsViewable, true)
  assert.equal(updateBody.status.selfDeclaredMadeForKids, false)
  assert.equal(updateBody.status.containsSyntheticMedia, false)
  assert.equal("publishAt" in updateBody.status, false)

  const persisted = await getYouTubePublicPromotionRecord("render-job-public-123", options)
  assert.equal(persisted?.status, "succeeded")
  assert.equal(persisted?.youtubeVideoId, "youtube-public-test-123")

  const callCount = calls.length
  const second = await promoteRenderedTwitchShortPublic(
    { renderJobId: "render-job-public-123", approved: true },
    options,
  )
  assert.equal(second.reused, true)
  assert.equal(second.record.status, "succeeded")
  assert.equal(calls.length, callCount)
})

test("missing YouTube edit scope fails before consuming a promotion attempt", async () => {
  const redis = new MemoryRedis()
  await seedVerifiedPrivateUpload(redis)

  const fetcher = (async (input: URL | RequestInfo) => {
    const url = String(input)
    if (url.startsWith("https://www.googleapis.com/youtube/v3/channels?")) {
      return new Response(JSON.stringify({
        items: [{ id: SMOKYBANANA03_YOUTUBE_CHANNEL_ID, snippet: { title: "SmokyBanana03" } }],
      }), { status: 200, headers: { "content-type": "application/json" } })
    }
    throw new Error("unexpected_fetch")
  }) as typeof fetch

  await storeYouTubeOwnerConnectionFromGoogle({
    email: "owner@example.com",
    refreshToken: "public-refresh-token-without-edit-scope-1234567890",
    accessToken: "initial-owner-access-token",
    scopes: [YOUTUBE_UPLOAD_SCOPE, YOUTUBE_READONLY_SCOPE],
  }, {
    env: env(),
    redis: redis as never,
    fetcher,
  })

  await assert.rejects(
    promoteRenderedTwitchShortPublic(
      { renderJobId: "render-job-public-123", approved: true },
      {
        env: env(),
        redis: redis as never,
        fetcher,
        getRenderJob: async () => renderedJob(),
      },
    ),
    /YOUTUBE_PUBLIC_EDIT_SCOPE_REQUIRED/u,
  )

  assert.equal(
    await getYouTubePublicPromotionRecord("render-job-public-123", {
      env: env(),
      redis: redis as never,
    }),
    null,
  )
})
