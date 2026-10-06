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

function reconciliationFixture(options: {
  privacy: "public" | "private"
  recordStatus?: "promoting" | "reconciliation"
  minutesOld?: number
  attempts?: number
  videoChannelId?: string
}) {
  const redis = new MemoryRedis()
  const now = new Date("2026-10-03T20:05:00.000Z")
  let privacy = options.privacy
  let updateCount = 0
  const updates: Array<{ id: string; status: Record<string, unknown> }> = []
  const fetcher = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith("https://www.googleapis.com/youtube/v3/channels?")) {
      return Response.json({ items: [{ id: SMOKYBANANA03_YOUTUBE_CHANNEL_ID, snippet: { title: "SmokyBanana03" } }] })
    }
    if (url === "https://oauth2.googleapis.com/token") {
      return Response.json({ access_token: "reconciliation-access-token" })
    }
    if (url.startsWith("https://www.googleapis.com/youtube/v3/videos?part=id%2Csnippet%2Cstatus")) {
      return Response.json({ items: [{
        id: "youtube-public-test-123",
        snippet: { channelId: options.videoChannelId ?? SMOKYBANANA03_YOUTUBE_CHANNEL_ID },
        status: { privacyStatus: privacy, embeddable: true, selfDeclaredMadeForKids: false },
      }] })
    }
    if (url === "https://www.googleapis.com/youtube/v3/videos?part=status" && init?.method === "PUT") {
      const update = JSON.parse(String(init.body)) as { id: string; status: Record<string, unknown> }
      updates.push(update)
      updateCount++
      privacy = "public"
      return Response.json({ id: update.id, status: update.status })
    }
    return new Response("not found", { status: 404 })
  }) as typeof fetch

  async function setup() {
    await seedVerifiedPrivateUpload(redis)
    const updatedAt = new Date(now.getTime() - (options.minutesOld ?? 5) * 60_000).toISOString()
    await redis.set("ams:youtube-public-promotion:v1:job:render-job-public-123", JSON.stringify({
      version: "youtube-public-promotion-v1",
      renderJobId: "render-job-public-123",
      clipId: "clip-public-123",
      sourceVideoId: "vod-123",
      selectionRank: 1,
      youtubeVideoId: "youtube-public-test-123",
      channelId: SMOKYBANANA03_YOUTUBE_CHANNEL_ID,
      status: options.recordStatus ?? "reconciliation",
      attempts: options.attempts ?? 1,
      createdAt: "2026-10-03T20:00:00.000Z",
      updatedAt,
      completedAt: null,
      errorCode: "YOUTUBE_PUBLIC_UPDATE_AMBIGUOUS",
    }))
    await storeYouTubeOwnerConnectionFromGoogle({
      email: "owner@example.com",
      refreshToken: "reconciliation-refresh-token-12345678901234567890",
      accessToken: "initial-owner-access-token",
      scopes: [YOUTUBE_UPLOAD_SCOPE, YOUTUBE_READONLY_SCOPE, YOUTUBE_FORCE_SSL_SCOPE],
    }, { env: env(), redis: redis as never, fetcher })
  }

  return {
    setup,
    redis,
    updates,
    updateCount: () => updateCount,
    run: () => promoteRenderedTwitchShortPublic(
      { renderJobId: "render-job-public-123", approved: true },
      { env: env(), redis: redis as never, fetcher, now: () => now, getRenderJob: async () => renderedJob() },
    ),
  }
}

test("reconcile already-public Short after interrupted status update without a second PUT", async () => {
  const fixture = reconciliationFixture({ privacy: "public" })
  await fixture.setup()
  const outcome = await fixture.run()
  assert.equal(outcome.record.status, "succeeded")
  assert.equal(outcome.reused, true)
  assert.equal(fixture.updateCount(), 0)
  const entries = await fixture.redis.get<string>("ams:youtube-public-promotion:v1:stream:vod-123")
  assert.equal((JSON.parse(entries ?? "[]") as unknown[]).length, 1)
})

test("stale ambiguous private Short is retried by updating the same verified video only", async () => {
  const fixture = reconciliationFixture({ privacy: "private" })
  await fixture.setup()
  const outcome = await fixture.run()
  assert.equal(outcome.record.status, "succeeded")
  assert.equal(outcome.record.attempts, 2)
  assert.equal(fixture.updateCount(), 1)
  assert.equal(fixture.updates[0].id, "youtube-public-test-123")
  assert.equal(fixture.updates[0].status.privacyStatus, "public")
})

test("recent in-flight promotion remains fenced from automatic retry", async () => {
  const fixture = reconciliationFixture({ privacy: "private", recordStatus: "promoting", minutesOld: 1 })
  await fixture.setup()
  await assert.rejects(fixture.run(), /YOUTUBE_PUBLIC_RECONCILIATION_REQUIRED/u)
  assert.equal(fixture.updateCount(), 0)
})

test("public readback must match the exact authorized channel", async () => {
  const fixture = reconciliationFixture({ privacy: "public", videoChannelId: "UC0000000000000000000000" })
  await fixture.setup()
  await assert.rejects(fixture.run(), /YOUTUBE_CHANNEL_MISMATCH/u)
  assert.equal(fixture.updateCount(), 0)
})

test("ambiguous private promotion respects the automatic retry limit", async () => {
  const fixture = reconciliationFixture({ privacy: "private", attempts: 3 })
  await fixture.setup()
  await assert.rejects(fixture.run(), /YOUTUBE_PUBLIC_ATTEMPT_LIMIT_REACHED/u)
  assert.equal(fixture.updateCount(), 0)
})
