import assert from "node:assert/strict"
import test from "node:test"

import {
  autoUploadRenderedTwitchShort,
  getSmokyYouTubeConfiguration,
  uploadPrivateVideoToLockedSmokyChannel,
  verifySmokyYouTubeChannel,
} from "../lib/server/smoky-youtube-uploader"
import { twitchShortRenderJobSchema } from "../lib/server/twitch-short-render-jobs"

const channelId = "UC1234567890123456789012"

function configuredEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    AMS_SMOKY_YOUTUBE_AUTO_UPLOAD_ENABLED: "true",
    AMS_SMOKY_YOUTUBE_CLIENT_ID: "client-123456789012345678901234567890",
    AMS_SMOKY_YOUTUBE_CLIENT_SECRET: "secret-123456789012345678901234567890",
    AMS_SMOKY_YOUTUBE_REFRESH_TOKEN: "refresh-123456789012345678901234567890",
    AMS_SMOKY_YOUTUBE_EXPECTED_CHANNEL_ID: channelId,
  }
}

test("Smoky YouTube uploader stays fail-closed until every single-channel setting is valid", () => {
  assert.equal(getSmokyYouTubeConfiguration({ NODE_ENV: "test" }).configured, false)
  assert.equal(getSmokyYouTubeConfiguration({
    ...configuredEnv(),
    AMS_SMOKY_YOUTUBE_EXPECTED_CHANNEL_ID: "replace-with-channel",
  }).configured, false)
  assert.equal(getSmokyYouTubeConfiguration(configuredEnv()).configured, true)
})

test("authenticated YouTube identity must exactly match the locked SmokyBanana03 channel ID", async () => {
  const fetcher = (async () => new Response(JSON.stringify({
    items: [{ id: "UC0000000000000000000000", snippet: { title: "Wrong channel" } }],
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as typeof fetch

  await assert.rejects(
    verifySmokyYouTubeChannel("access-token", channelId, fetcher),
    /SMOKY_YOUTUBE_CHANNEL_MISMATCH/u,
  )
})

test("YouTube upload is hard-coded private with subscriber notifications disabled", async () => {
  const calls: Array<{ url: string; method: string; body: unknown }> = []
  const fetcher = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, method: init?.method ?? "GET", body: init?.body ?? null })

    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({ access_token: "access-token", expires_in: 3600 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    if (url.startsWith("https://www.googleapis.com/youtube/v3/channels")) {
      return new Response(JSON.stringify({
        items: [{ id: channelId, snippet: { title: "SmokyBanana03" } }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    if (url === "https://media.example.test/short.mp4") {
      return new Response(Buffer.from("fake-video-bytes"), {
        status: 200,
        headers: { "content-type": "video/mp4" },
      })
    }
    if (url.startsWith("https://www.googleapis.com/upload/youtube/v3/videos")) {
      return new Response(null, {
        status: 200,
        headers: { location: "https://upload.youtube.test/session-1" },
      })
    }
    if (url === "https://upload.youtube.test/session-1") {
      return new Response(JSON.stringify({ id: "youtube-video-123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }

    return new Response("unexpected", { status: 500 })
  }) as typeof fetch

  const result = await uploadPrivateVideoToLockedSmokyChannel({
    sourceUrl: "https://media.example.test/short.mp4",
    title: "Quick triple kill",
    description: "SmokyBanana03 gameplay highlight.",
    tags: ["Call of Duty", "gaming", "Twitch"],
    hashtags: ["SmokyBanana03", "Shorts"],
  }, {
    env: configuredEnv(),
    fetch: fetcher,
  })

  assert.equal(result.youtubeVideoId, "youtube-video-123")
  assert.equal(result.channelId, channelId)
  assert.equal(result.channelTitle, "SmokyBanana03")
  assert.equal(result.privacyStatus, "private")
  assert.equal(result.notifySubscribers, false)

  const initiate = calls.find((call) =>
    call.url.startsWith("https://www.googleapis.com/upload/youtube/v3/videos"),
  )
  assert.ok(initiate)
  const parsed = JSON.parse(String(initiate.body)) as {
    snippet: { title: string; description: string; categoryId: string }
    status: { privacyStatus: string }
  }
  assert.equal(parsed.status.privacyStatus, "private")
  assert.equal(parsed.snippet.categoryId, "20")
  assert.match(parsed.snippet.description, /#SmokyBanana03/u)
  assert.match(initiate.url, /notifySubscribers=false/u)
})

test("auto-upload refuses a rendered job from any Twitch broadcaster other than SmokyBanana03", async () => {
  const job = twitchShortRenderJobSchema.parse({
    version: "twitch-short-render-v1",
    jobId: "job-wrong-broadcaster",
    streamId: "stream-1",
    broadcasterId: "999999999",
    clipId: "clip-1",
    sourceObjectKey: "creators/twitch/999999999/stream-1/clips/clip-1/landscape.mp4",
    outputObjectKey: "creators/twitch/999999999/stream-1/shorts/clip-1.mp4",
    status: "rendered",
    attempts: 1,
    createdAt: "2026-09-25T20:00:00.000Z",
    updatedAt: "2026-09-25T20:01:00.000Z",
    claimedAt: "2026-09-25T20:00:30.000Z",
    completedAt: "2026-09-25T20:01:00.000Z",
    errorCode: null,
    shortDraft: {
      title: "Test",
      hook: "Test hook",
      caption: "Test caption",
      hashtags: ["#Gaming"],
    },
    publishMetadata: {
      title: "Test metadata",
      description: "Test metadata description",
      tags: ["gaming", "twitch", "fps"],
      hashtags: ["#Gaming", "#Twitch", "#FPS"],
      keywords: ["gaming", "twitch", "fps"],
      categoryLabel: "Gaming",
      twitchClipTitle: "Test clip",
      youtube: {
        title: "Test YouTube title",
        description: "Test YouTube description",
        tags: ["gaming", "twitch", "fps"],
        hashtags: ["#Gaming", "#Twitch", "#Shorts"],
      },
      tiktok: {
        caption: "Test TikTok",
        hashtags: ["#Gaming", "#Twitch", "#FPS"],
      },
      instagram: {
        caption: "Test Instagram",
        hashtags: ["#Gaming", "#Twitch", "#FPS"],
      },
      x: {
        post: "Test X post",
      },
    },
  })

  const result = await autoUploadRenderedTwitchShort(job, {
    env: configuredEnv(),
    redis: null,
  })
  assert.equal(result.status, "blocked")
  assert.equal(result.errorCode, "SMOKY_YOUTUBE_TWITCH_BROADCASTER_MISMATCH")
})
