import assert from "node:assert/strict"
import test from "node:test"

import {
  getYouTubePrivateUploaderConfiguration,
  getYouTubePrivateVerificationProof,
  uploadRenderedTwitchShortPrivate,
  verifyRenderedTwitchShortPrivate,
} from "../lib/server/youtube-private-uploader"
import {
  twitchShortRenderJobSchema,
  type TwitchShortRenderJob,
} from "../lib/server/twitch-short-render-jobs"
import {
  SMOKYBANANA03_YOUTUBE_CHANNEL_ID,
  storeYouTubeOwnerConnectionFromGoogle,
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
    AMS_YOUTUBE_CLIENT_ID: "youtube-client-12345678901234567890",
    AMS_YOUTUBE_CLIENT_SECRET: "youtube-secret-123456789012345678",
    AMS_YOUTUBE_REFRESH_TOKEN: "youtube-refresh-123456789012345678",
    AMS_YOUTUBE_CHANNEL_ID: SMOKYBANANA03_YOUTUBE_CHANNEL_ID,
    ...overrides,
  }
}

function renderedJob(): TwitchShortRenderJob {
  const now = "2026-09-30T13:00:00.000Z"
  return twitchShortRenderJobSchema.parse({
    version: "twitch-short-render-v1",
    jobId: "render-job-123",
    streamId: "stream-123",
    broadcasterId: "broadcaster-123",
    clipId: "clip-123",
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
      title: "Quick triple kill",
      hook: "Quick triple kill",
      caption: "A strong Call of Duty moment.",
      hashtags: ["#SmokyBanana03", "#Gaming", "#Shorts"],
    },
    videoAnalysis: {
      version: "twitch-video-analysis-v3",
      analyzedAt: now,
      model: "google/gemini-2.5-flash",
      score: 75,
      recommendation: "render",
      reason: "Strong gameplay moment.",
      bestStartSeconds: 1,
      bestEndSeconds: 20,
    },
    publishMetadata: {
      title: "Quick triple kill",
      description: "Actual Twitch footage from SmokyBanana03.",
      tags: ["gaming", "twitch", "shorts"],
      hashtags: ["#SmokyBanana03", "#Gaming", "#Shorts"],
      keywords: ["gaming", "twitch", "shorts"],
      categoryLabel: "Gaming",
      twitchClipTitle: "Quick triple kill",
      youtube: {
        title: "Quick triple kill",
        description: "Actual Twitch footage from SmokyBanana03. #Gaming #Shorts",
        tags: ["gaming", "twitch", "shorts"],
        hashtags: ["#SmokyBanana03", "#Gaming", "#Shorts"],
      },
      tiktok: {
        caption: "Quick triple kill",
        hashtags: ["#SmokyBanana03", "#Gaming", "#Twitch"],
      },
      instagram: {
        caption: "Quick triple kill",
        hashtags: ["#SmokyBanana03", "#Gaming", "#Twitch"],
      },
      x: { post: "Quick triple kill #Gaming" },
    },
  })
}

test("YouTube private uploader fails closed when credentials are absent", () => {
  assert.deepEqual(
    getYouTubePrivateUploaderConfiguration({ NODE_ENV: "test" }),
    {
      configured: false,
      privacyStatus: "private",
      expectedChannelConfigured: true,
    },
  )
})

test("YouTube private uploader recognizes a complete server-side configuration", () => {
  assert.deepEqual(
    getYouTubePrivateUploaderConfiguration(env()),
    {
      configured: true,
      privacyStatus: "private",
      expectedChannelConfigured: true,
    },
  )
})

test("YouTube private uploader requires explicit approval", async () => {
  await assert.rejects(
    uploadRenderedTwitchShortPrivate(
      { renderJobId: "render-job-123", approved: false },
      { env: env(), redis: new MemoryRedis() as never },
    ),
    /YOUTUBE_PRIVATE_UPLOAD_APPROVAL_REQUIRED/u,
  )
})

test("YouTube private uploader uploads exactly once, forces private, and verifies the channel", async () => {
  const redis = new MemoryRedis()
  const calls: Array<{ url: string; method: string; body: string }> = []
  const expectedChannel = env().AMS_YOUTUBE_CHANNEL_ID!
  const videoId = "youtube-video-123"

  const fetcher = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    const body =
      typeof init?.body === "string"
        ? init.body
        : init?.body instanceof URLSearchParams
          ? init.body.toString()
          : ""
    calls.push({ url, method, body })

    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({ access_token: "access-token-123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    if (url.startsWith("https://www.googleapis.com/youtube/v3/channels?")) {
      return new Response(JSON.stringify({ items: [{ id: expectedChannel }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    if (url === "https://r2.example.test/rendered.mp4") {
      return new Response(new Uint8Array([0, 1, 2, 3, 4]), {
        status: 200,
        headers: { "content-type": "video/mp4" },
      })
    }
    if (url.startsWith("https://www.googleapis.com/upload/youtube/v3/videos?")) {
      return new Response("", {
        status: 200,
        headers: { location: "https://upload.example.test/session-123" },
      })
    }
    if (url === "https://upload.example.test/session-123") {
      return new Response(
        JSON.stringify({
          id: videoId,
          status: { privacyStatus: "private" },
        }),
        {
          status: 201,
          headers: { "content-type": "application/json" },
        },
      )
    }
    if (url.startsWith("https://www.googleapis.com/youtube/v3/videos?")) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: videoId,
              snippet: { channelId: expectedChannel },
              status: { privacyStatus: "private" },
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      )
    }
    return new Response("not found", { status: 404 })
  }) as typeof fetch

  const job = renderedJob()
  job.publishMetadata!.youtube.tags = Array.from(
    { length: 20 },
    (_, index) => `long tag ${index + 1} ${"x".repeat(52)}`,
  )

  const options = {
    env: env(),
    redis: redis as never,
    fetcher,
    now: () => new Date("2026-09-30T13:00:00.000Z"),
    getRenderedShort: async () => ({
      job,
      previewUrl: "https://r2.example.test/rendered.mp4",
    }),
  }

  const first = await uploadRenderedTwitchShortPrivate(
    { renderJobId: "render-job-123", approved: true },
    options,
  )

  assert.equal(first.reused, false)
  assert.equal(first.record.status, "succeeded")
  assert.equal(first.record.privacyStatus, "private")
  assert.equal(first.record.youtubeVideoId, videoId)
  assert.equal(first.record.channelId, expectedChannel)

  const initCall = calls.find((call) =>
    call.url.startsWith("https://www.googleapis.com/upload/youtube/v3/videos?"),
  )
  assert.ok(initCall)
  assert.match(initCall.url, /notifySubscribers=false/u)
  const metadata = JSON.parse(initCall.body)
  assert.equal(metadata.status.privacyStatus, "private")
  assert.equal(metadata.snippet.categoryId, "20")
  const uploadedTags = metadata.snippet.tags as string[]
  const tagBudget = uploadedTags.reduce(
    (total, tag, index) => total + tag.length + (/\s/u.test(tag) ? 2 : 0) + (index ? 1 : 0),
    0,
  )
  assert.ok(uploadedTags.length >= 3)
  assert.ok(tagBudget <= 500)

  const callCountAfterFirst = calls.length
  const second = await uploadRenderedTwitchShortPrivate(
    { renderJobId: "render-job-123", approved: true },
    options,
  )
  assert.equal(second.reused, true)
  assert.equal(second.record.youtubeVideoId, videoId)
  assert.equal(calls.length, callCountAfterFirst)
})

test("YouTube private uploader fails before upload when the authorized channel does not match", async () => {
  const redis = new MemoryRedis()
  const fetcher = (async (input: URL | RequestInfo) => {
    const url = String(input)
    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({ access_token: "access-token-123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    if (url.startsWith("https://www.googleapis.com/youtube/v3/channels?")) {
      return new Response(JSON.stringify({ items: [{ id: "UC0000000000000000000000" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    throw new Error("unexpected_fetch")
  }) as typeof fetch

  const result = await uploadRenderedTwitchShortPrivate(
    { renderJobId: "render-job-123", approved: true },
    {
      env: env(),
      redis: redis as never,
      fetcher,
      getRenderedShort: async () => ({
        job: renderedJob(),
        previewUrl: "https://r2.example.test/rendered.mp4",
      }),
    },
  )

  assert.equal(result.record.status, "failed")
  assert.equal(result.record.errorCode, "YOUTUBE_CHANNEL_MISMATCH")
  assert.equal(result.record.youtubeVideoId, null)
})


test("YouTube private uploader uses the encrypted owner OAuth connection without AMS YouTube env secrets", async () => {
  const redis = new MemoryRedis()
  const nativeEnv: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    GOOGLE_CLIENT_ID: "google-client-12345678901234567890",
    GOOGLE_CLIENT_SECRET: "google-secret-12345678901234567890",
    NEXTAUTH_SECRET: "nextauth-secret-with-enough-entropy-for-tests",
    AMS_OWNER_EMAIL: "owner@example.com",
  }
  const videoId = "youtube-video-native-456"

  const fetcher = (async (input: URL | RequestInfo) => {
    const url = String(input)
    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({ access_token: "access-token-native-123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    if (url.startsWith("https://www.googleapis.com/youtube/v3/channels?")) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: SMOKYBANANA03_YOUTUBE_CHANNEL_ID,
              snippet: { title: "SmokyBanana03" },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }
    if (url === "https://r2.example.test/native-rendered.mp4") {
      return new Response(new Uint8Array([0, 1, 2, 3, 4]), {
        status: 200,
        headers: { "content-type": "video/mp4" },
      })
    }
    if (url.startsWith("https://www.googleapis.com/upload/youtube/v3/videos?")) {
      return new Response("", {
        status: 200,
        headers: { location: "https://upload.example.test/native-session" },
      })
    }
    if (url === "https://upload.example.test/native-session") {
      return new Response(JSON.stringify({ id: videoId }), {
        status: 201,
        headers: { "content-type": "application/json" },
      })
    }
    if (url.startsWith("https://www.googleapis.com/youtube/v3/videos?")) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: videoId,
              snippet: { channelId: SMOKYBANANA03_YOUTUBE_CHANNEL_ID },
              status: { privacyStatus: "private" },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }
    return new Response("not found", { status: 404 })
  }) as typeof fetch

  await storeYouTubeOwnerConnectionFromGoogle(
    {
      email: "owner@example.com",
      refreshToken: "native-refresh-token-12345678901234567890",
      accessToken: "initial-access-token-1234567890",
      scopes: [YOUTUBE_UPLOAD_SCOPE, YOUTUBE_READONLY_SCOPE],
    },
    {
      env: nativeEnv,
      redis: redis as never,
      fetcher,
    },
  )

  const result = await uploadRenderedTwitchShortPrivate(
    { renderJobId: "render-job-123", approved: true },
    {
      env: nativeEnv,
      redis: redis as never,
      fetcher,
      getRenderedShort: async () => ({
        job: renderedJob(),
        previewUrl: "https://r2.example.test/native-rendered.mp4",
      }),
    },
  )

  assert.equal(result.record.status, "succeeded")
  assert.equal(result.record.youtubeVideoId, videoId)
  assert.equal(result.record.channelId, SMOKYBANANA03_YOUTUBE_CHANNEL_ID)
  assert.equal(result.record.privacyStatus, "private")
})

async function verificationFixture() {
  const redis = new MemoryRedis()
  await redis.set("ams:youtube-private-upload:v1:job:render-job-123", JSON.stringify({
    version: "youtube-private-upload-v1", renderJobId: "render-job-123", clipId: "clip-123",
    status: "succeeded", privacyStatus: "private", youtubeVideoId: "verified-video-123",
    channelId: SMOKYBANANA03_YOUTUBE_CHANNEL_ID, attempts: 1,
    createdAt: "2026-09-30T13:00:00.000Z", updatedAt: "2026-09-30T13:00:00.000Z",
    completedAt: "2026-09-30T13:00:00.000Z", errorCode: null,
  }))
  const job = renderedJob()
  const video = {
    id: "verified-video-123",
    snippet: { ...job.publishMetadata!.youtube, channelId: String(SMOKYBANANA03_YOUTUBE_CHANNEL_ID), categoryId: "20" },
    status: { privacyStatus: "private" },
  }
  const calls: string[] = []
  const fetcher = (async (input: URL | RequestInfo) => {
    const url = String(input)
    calls.push(url)
    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({ access_token: "test-verification-access-token" }), { status: 200 })
    }
    if (url.startsWith("https://www.googleapis.com/youtube/v3/videos?")) {
      return new Response(JSON.stringify({ items: [video] }), { status: 200 })
    }
    throw new Error("unexpected_fetch")
  }) as typeof fetch
  return { redis, video, job, calls, options: {
    env: env(), redis: redis as never, fetcher,
    getRenderedShort: async () => ({ job, previewUrl: "https://r2.example.test/not-fetched.mp4" }),
  } }
}

test("private video verification reads API metadata, persists proof, and never uploads", async () => {
  const fixture = await verificationFixture()
  const proof = await verifyRenderedTwitchShortPrivate("render-job-123", fixture.options)
  assert.equal(proof.metadataVerified, true)
  assert.equal(proof.channelId, SMOKYBANANA03_YOUTUBE_CHANNEL_ID)
  assert.equal(proof.privacyStatus, "private")
  assert.equal(proof.categoryId, "20")
  assert.equal(proof.notifySubscribers, false)
  assert.equal(proof.notificationEvidence, "upload-request-policy")
  assert.equal(proof.verificationSource, "youtube-data-api")
  const stored = await fixture.redis.get<string>("ams:youtube-private-upload:v1:verification:render-job-123")
  assert.equal(JSON.parse(stored!).videoId, "verified-video-123")
  assert.equal(fixture.calls.some(url => url.includes("/upload/") || url.includes("r2.example")), false)
  await verifyRenderedTwitchShortPrivate("render-job-123", fixture.options)
  assert.equal(fixture.calls.length, 4)
})


test("private video verification accepts provider-normalized text and a stored tag subset", async () => {
  const fixture = await verificationFixture()
  fixture.job.publishMetadata!.youtube.title = "Quick triple kill  "
  fixture.job.publishMetadata!.youtube.description = "Actual Twitch footage from SmokyBanana03. #Gaming #Shorts\r\n"
  fixture.job.publishMetadata!.youtube.tags = [
    "gaming",
    "Twitch",
    "shorts",
    "Call of Duty",
    "SmokyBanana03",
  ]
  fixture.video.snippet.title = "Quick triple kill"
  fixture.video.snippet.description = "Actual Twitch footage from SmokyBanana03. #Gaming #Shorts"
  fixture.video.snippet.tags = ["Shorts", "GAMING", "twitch"]
  const proof = await verifyRenderedTwitchShortPrivate("render-job-123", fixture.options)
  assert.equal(proof.metadataVerified, true)
  assert.equal(proof.tagVerification, "stored-subset")
  assert.equal(proof.expectedTagCount, 5)
  assert.equal(proof.storedTagCount, 3)
  const durable = await getYouTubePrivateVerificationProof("render-job-123", fixture.options)
  assert.equal(durable?.videoId, "verified-video-123")
  assert.equal(durable?.tagVerification, "stored-subset")
})

test("private video verification fails closed on altered metadata, wrong channel or public privacy", async () => {
  for (const change of ["title", "description", "tags", "category", "channel", "privacy"] as const) {
    const fixture = await verificationFixture()
    if (change === "title") fixture.video.snippet.title = "changed"
    if (change === "description") fixture.video.snippet.description = "changed"
    if (change === "tags") fixture.video.snippet.tags = ["changed"]
    if (change === "category") fixture.video.snippet.categoryId = "22"
    if (change === "channel") fixture.video.snippet.channelId = "UC0000000000000000000000"
    if (change === "privacy") fixture.video.status.privacyStatus = "public"
    await assert.rejects(
      verifyRenderedTwitchShortPrivate("render-job-123", fixture.options),
      /YOUTUBE_UPLOAD_(?:METADATA_(?:TITLE|DESCRIPTION|TAGS|CATEGORY)_MISMATCH|VERIFICATION_MISMATCH)/u,
    )
    assert.equal(await fixture.redis.get("ams:youtube-private-upload:v1:verification:render-job-123"), null)
  }
})

test("private video verification requires an existing successful upload", async () => {
  await assert.rejects(verifyRenderedTwitchShortPrivate("missing", {
    env: env(), redis: new MemoryRedis() as never,
    fetcher: (async () => { throw new Error("unexpected_fetch") }) as typeof fetch,
  }), /YOUTUBE_UPLOAD_VERIFIED_RECORD_REQUIRED/u)
})
