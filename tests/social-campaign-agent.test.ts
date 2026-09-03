import assert from "node:assert/strict"
import test from "node:test"

import {
  socialCampaignInputSchema,
  socialCampaignOutputSchema,
  type SocialChannel,
} from "../lib/server/social-campaign-agent"
import { getSocialPublisherConfiguration, publishSocialChannel } from "../lib/server/social-publisher"
import type { SocialCampaignRecord } from "../lib/server/social-campaign-store"

const validInput = {
  businessName: "Aspect Marketing Solutions",
  audience: "Small business owners who need clearer marketing",
  goal: "Drive qualified traffic to the Quick Marketing Audit",
  offer: "$49 Quick Marketing Audit",
  destinationUrl: "https://www.aspectmarketingsolutions.app/quick-marketing-audit",
  campaignName: "AMS Eyeballs",
  tone: "conversational" as const,
  channels: ["linkedin", "facebook"] as const,
}

function draft(channel: SocialChannel) {
  return {
    channel,
    title: `${channel} title`,
    body: `${channel} body`,
    hashtags: ["SmallBusiness"],
    mediaBrief: channel === "facebook" || channel === "linkedin" ? null : "Use an approved AMS dashboard image.",
    callToAction: "Review AMS",
  }
}

function record(overrides: Partial<SocialCampaignRecord> = {}): SocialCampaignRecord {
  const now = "2026-08-27T12:00:00.000Z"
  const posts = (["linkedin", "facebook", "instagram", "pinterest", "youtube-shorts"] as SocialChannel[]).map(draft)
  return {
    id: "social-campaign-12345678-1234-4234-9234-123456789abc",
    idempotencyKey: "social-test-key-001",
    inputFingerprint: "a".repeat(64),
    agentVersion: "social-campaign-v1",
    input: {
      ...validInput,
      destinationUrl: "https://www.aspectmarketingsolutions.app/social-test-image.jpg",
      channels: posts.map((post) => post.channel),
    },
    output: {
      campaignName: "AMS Social Test",
      posts,
      safetyNotes: [],
    },
    status: "approved",
    deliveries: posts.map((post) => ({
      channel: post.channel,
      status: "approved",
      externalId: null,
      errorCode: null,
      updatedAt: now,
    })),
    createdAt: now,
    updatedAt: now,
    approvedAt: now,
    ...overrides,
  }
}

function env(values: Record<string, string>): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...values } as NodeJS.ProcessEnv
}

test("social campaign input accepts unique supported channels", () => {
  const parsed = socialCampaignInputSchema.parse({
    ...validInput,
    channels: [...validInput.channels],
  })
  assert.deepEqual(parsed.channels, ["linkedin", "facebook"])
})

test("social campaign input rejects duplicate channels", () => {
  const parsed = socialCampaignInputSchema.safeParse({
    ...validInput,
    channels: ["linkedin", "linkedin"],
  })
  assert.equal(parsed.success, false)
})

test("social campaign output rejects duplicate platform drafts", () => {
  const draft = {
    channel: "linkedin" as const,
    title: null,
    body: "A useful post",
    hashtags: ["#SmallBusiness"],
    mediaBrief: null,
    callToAction: "Get the audit",
  }
  const parsed = socialCampaignOutputSchema.safeParse({
    campaignName: "AMS Eyeballs",
    posts: [draft, draft],
    safetyNotes: [],
  })
  assert.equal(parsed.success, false)
})

test("social publishers fail closed when credentials are absent", () => {
  const keys = [
    "AMS_LINKEDIN_ACCESS_TOKEN",
    "AMS_LINKEDIN_AUTHOR_URN",
    "AMS_LINKEDIN_API_VERSION",
    "AMS_META_ACCESS_TOKEN",
    "AMS_META_GRAPH_API_VERSION",
    "AMS_FACEBOOK_PAGE_ID",
    "AMS_INSTAGRAM_USER_ID",
    "AMS_PINTEREST_ACCESS_TOKEN",
    "AMS_PINTEREST_BOARD_ID",
    "AMS_YOUTUBE_CLIENT_ID",
    "AMS_YOUTUBE_CLIENT_SECRET",
    "AMS_YOUTUBE_REFRESH_TOKEN",
    "AMS_YOUTUBE_CHANNEL_ID",
  ] as const
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))

  try {
    for (const key of keys) delete process.env[key]
    assert.deepEqual(getSocialPublisherConfiguration(), {
      linkedin: false,
      facebook: false,
      instagram: false,
      pinterest: false,
      "youtube-shorts": false,
    })
  } finally {
    for (const key of keys) {
      const value = previous[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test("social publisher rejects unapproved campaigns before provider calls", async () => {
  let calls = 0
  const result = await publishSocialChannel(
    record({ approvedAt: null, status: "draft" }),
    "facebook",
    {
      fetch: async () => {
        calls += 1
        return new Response("{}")
      },
      env: env({
        AMS_META_ACCESS_TOKEN: "meta_token_fixture_1234567890",
        AMS_META_GRAPH_API_VERSION: "v23.0",
        AMS_FACEBOOK_PAGE_ID: "615499",
      }),
    },
  )
  assert.equal(result.status, "failed")
  assert.equal(result.errorCode, "SOCIAL_CAMPAIGN_APPROVAL_REQUIRED")
  assert.equal(calls, 0)
})

test("LinkedIn publisher sends versioned Posts API request and captures x-restli-id", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const result = await publishSocialChannel(record(), "linkedin", {
    env: env({
      AMS_LINKEDIN_ACCESS_TOKEN: "linkedin_token_fixture_1234567890",
      AMS_LINKEDIN_AUTHOR_URN: "urn:li:organization:615499",
      AMS_LINKEDIN_API_VERSION: "202608",
    }),
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} })
      return new Response("{}", { status: 201, headers: { "x-restli-id": "urn:li:share:fixture" } })
    },
  })

  assert.equal(result.status, "published")
  assert.equal(result.externalId, "urn:li:share:fixture")
  assert.equal(calls[0].url, "https://api.linkedin.com/rest/posts")
  assert.equal((calls[0].init.headers as Record<string, string>)["Linkedin-Version"], "202608")
  assert.equal(JSON.stringify(result).includes("linkedin_token_fixture"), false)
})

test("LinkedIn publisher sanitizes provider failures and timeouts", async () => {
  const linkedInEnv = env({
    AMS_LINKEDIN_ACCESS_TOKEN: "linkedin_token_fixture_1234567890",
    AMS_LINKEDIN_AUTHOR_URN: "urn:li:organization:615499",
    AMS_LINKEDIN_API_VERSION: "202608",
  })
  const unauthorized = await publishSocialChannel(record(), "linkedin", {
    env: linkedInEnv,
    fetch: async () => new Response("secret provider body", { status: 401 }),
  })
  assert.equal(unauthorized.errorCode, "LINKEDIN_HTTP_401")
  assert.equal(JSON.stringify(unauthorized).includes("secret provider body"), false)

  const timeout = await publishSocialChannel(record(), "linkedin", {
    env: linkedInEnv,
    fetch: async () => {
      throw new DOMException("The operation was aborted", "AbortError")
    },
  })
  assert.equal(timeout.errorCode, "LINKEDIN_PUBLISH_TIMEOUT")
})

test("Facebook publisher fails closed without config and captures authoritative post id on success", async () => {
  const missing = await publishSocialChannel(record(), "facebook", {
    env: env({}),
    fetch: async () => new Response("{}"),
  })
  assert.equal(missing.status, "not_configured")
  assert.equal(missing.errorCode, "FACEBOOK_PUBLISHER_NOT_CONFIGURED")

  const calls: Array<{ url: string; body: string }> = []
  const result = await publishSocialChannel(record(), "facebook", {
    env: env({
      AMS_META_ACCESS_TOKEN: "meta_token_fixture_1234567890",
      AMS_META_GRAPH_API_VERSION: "v23.0",
      AMS_FACEBOOK_PAGE_ID: "615499",
    }),
    fetch: async (url, init) => {
      calls.push({ url: String(url), body: String(init?.body) })
      return Response.json({ id: "615499_123" })
    },
  })
  assert.equal(result.status, "published")
  assert.equal(result.externalId, "615499_123")
  assert.match(calls[0].url, /graph\.facebook\.com\/v23\.0\/615499\/feed/u)
  assert.equal(JSON.stringify(result).includes("meta_token_fixture"), false)
})

test("Instagram publisher requires public media URL and uses create then publish flow", async () => {
  const noMedia = await publishSocialChannel(
    record({ input: { ...record().input, destinationUrl: undefined } }),
    "instagram",
    {
      env: env({
        AMS_META_ACCESS_TOKEN: "meta_token_fixture_1234567890",
        AMS_META_GRAPH_API_VERSION: "v23.0",
        AMS_INSTAGRAM_USER_ID: "17841400000000000",
      }),
      fetch: async () => new Response("{}"),
    },
  )
  assert.equal(noMedia.errorCode, "INSTAGRAM_MEDIA_URL_REQUIRED")

  const urls: string[] = []
  const result = await publishSocialChannel(record(), "instagram", {
    env: env({
      AMS_META_ACCESS_TOKEN: "meta_token_fixture_1234567890",
      AMS_META_GRAPH_API_VERSION: "v23.0",
      AMS_INSTAGRAM_USER_ID: "17841400000000000",
    }),
    fetch: async (url) => {
      urls.push(String(url))
      return Response.json({ id: urls.length === 1 ? "ig-container-1" : "ig-media-1" })
    },
  })
  assert.equal(result.status, "published")
  assert.equal(result.externalId, "ig-media-1")
  assert.match(urls[0], /\/media$/u)
  assert.match(urls[1], /\/media_publish$/u)
})

test("Pinterest publisher requires OAuth, board, and public media URL", async () => {
  const missing = await publishSocialChannel(record(), "pinterest", {
    env: env({ AMS_PINTEREST_ACCESS_TOKEN: "pinterest_token_fixture_1234567890" }),
    fetch: async () => new Response("{}"),
  })
  assert.equal(missing.errorCode, "PINTEREST_PUBLISHER_NOT_CONFIGURED")

  const result = await publishSocialChannel(record(), "pinterest", {
    env: env({
      AMS_PINTEREST_ACCESS_TOKEN: "pinterest_token_fixture_1234567890",
      AMS_PINTEREST_BOARD_ID: "1234567890",
    }),
    fetch: async (url, init) => {
      assert.equal(String(url), "https://api.pinterest.com/v5/pins")
      assert.match(String(init?.body), /media_source/u)
      return Response.json({ id: "pin-fixture-1" })
    },
  })
  assert.equal(result.status, "published")
  assert.equal(result.externalId, "pin-fixture-1")
})

test("YouTube Shorts publisher stays closed without verified video upload support", async () => {
  const configuredEnv = env({
    AMS_YOUTUBE_CLIENT_ID: "youtube-client-id-fixture-1234567890",
    AMS_YOUTUBE_CLIENT_SECRET: "youtube-client-secret-fixture-1234567890",
    AMS_YOUTUBE_REFRESH_TOKEN: "youtube-refresh-token-fixture-1234567890",
    AMS_YOUTUBE_CHANNEL_ID: "UC1234567890123456789012",
  })
  const missingVideo = await publishSocialChannel(record(), "youtube-shorts", {
    env: configuredEnv,
    fetch: async () => new Response("{}"),
  })
  assert.equal(missingVideo.errorCode, "YOUTUBE_SHORTS_VIDEO_URL_REQUIRED")

  const videoRecord = record({
    input: {
      ...record().input,
      destinationUrl: "https://www.aspectmarketingsolutions.app/demo-short.mp4",
    },
  })
  const result = await publishSocialChannel(videoRecord, "youtube-shorts", {
    env: configuredEnv,
    fetch: async () => {
      throw new Error("YouTube provider should not be called before upload support is verified")
    },
  })
  assert.equal(result.status, "not_configured")
  assert.equal(result.errorCode, "YOUTUBE_SHORTS_UPLOAD_NOT_VERIFIED")
})
