import assert from "node:assert/strict"
import test from "node:test"

import {
  getYouTubePrivateUploaderConfiguration,
  uploadRenderedTwitchShortPrivate,
} from "../lib/server/youtube-private-uploader"
import {
  twitchShortRenderJobSchema,
  type TwitchShortRenderJob,
} from "../lib/server/twitch-short-render-jobs"
import { SMOKYBANANA03_YOUTUBE_CHANNEL_ID } from "../lib/server/youtube-owner-connection"

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

  const options = {
    env: env(),
    redis: redis as never,
    fetcher,
    now: () => new Date("2026-09-30T13:00:00.000Z"),
    getRenderedShort: async () => ({
      job: renderedJob(),
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
