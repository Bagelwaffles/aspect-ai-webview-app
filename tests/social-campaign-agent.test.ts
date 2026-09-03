import assert from "node:assert/strict"
import test from "node:test"

import {
  SOCIAL_CAMPAIGN_AGENT_VERSION,
  socialCampaignInputSchema,
  socialCampaignOutputSchema,
  type SocialChannel,
} from "../lib/server/social-campaign-agent"
import { socialCampaignRecordSchema } from "../lib/server/social-campaign-store"
import {
  getSocialPublisherConfiguration,
  publishSocialChannel,
} from "../lib/server/social-publisher"

const validInput = {
  businessName: "Aspect Marketing Solutions",
  audience: "Small business owners who need clearer marketing",
  goal: "Drive qualified traffic to the Quick Marketing Audit",
  offer: "$49 Quick Marketing Audit",
  destinationUrl: "https://www.aspectmarketingsolutions.app/quick-marketing-audit",
  mediaUrl: "https://www.aspectmarketingsolutions.app/assets/quick-audit-social.png",
  campaignName: "AMS Eyeballs",
  tone: "conversational" as const,
  channels: ["linkedin", "facebook"] as const,
}

function approvedRecord(channel: SocialChannel, overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString()
  const draft = {
    channel,
    title: channel === "pinterest" ? "Pinterest title" : null,
    body: "A useful post for small business owners",
    hashtags: ["#SmallBusiness"],
    mediaBrief: channel === "instagram" || channel === "pinterest" ? "Use the approved audit visual" : null,
    callToAction: "Get the audit",
    ...(overrides.draft as Record<string, unknown> | undefined),
  }
  const input = {
    ...validInput,
    channels: [channel],
    ...(overrides.input as Record<string, unknown> | undefined),
  }
  return socialCampaignRecordSchema.parse({
    id: "social-campaign-12345678",
    idempotencyKey: "social-test-12345678",
    inputFingerprint: "a".repeat(64),
    agentVersion: SOCIAL_CAMPAIGN_AGENT_VERSION,
    input,
    output: {
      campaignName: validInput.campaignName,
      posts: [draft],
      safetyNotes: [],
    },
    status: "approved",
    deliveries: [
      {
        channel,
        status: "approved",
        externalId: null,
        errorCode: null,
        updatedAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
    approvedAt: now,
  })
}

test("social campaign input accepts unique supported channels", () => {
  const parsed = socialCampaignInputSchema.parse({
    ...validInput,
    channels: [...validInput.channels],
  })
  assert.deepEqual(parsed.channels, ["linkedin", "facebook"])
})

test("social campaign input supports Instagram plus a separate media URL", () => {
  const parsed = socialCampaignInputSchema.parse({
    ...validInput,
    channels: ["instagram", "pinterest"],
  })
  assert.deepEqual(parsed.channels, ["instagram", "pinterest"])
  assert.equal(parsed.destinationUrl, validInput.destinationUrl)
  assert.equal(parsed.mediaUrl, validInput.mediaUrl)
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
  const env = {} as NodeJS.ProcessEnv
  assert.deepEqual(getSocialPublisherConfiguration(env), {
    linkedin: false,
    facebook: false,
    instagram: false,
    pinterest: false,
    "youtube-shorts": false,
  })
})

test("social publisher configuration rejects placeholder identifiers and keeps YouTube closed", () => {
  const env = {
    AMS_LINKEDIN_ACCESS_TOKEN: "token_1234567890123456789012345",
    AMS_LINKEDIN_AUTHOR_URN: "urn:li:person:realperson123",
    AMS_LINKEDIN_API_VERSION: "202608",
    AMS_META_ACCESS_TOKEN: "meta_1234567890123456789012345",
    AMS_META_GRAPH_API_VERSION: "v24.0",
    AMS_FACEBOOK_PAGE_ID: "replace-with-facebook-page-id",
    AMS_INSTAGRAM_USER_ID: "real_instagram_123",
    AMS_PINTEREST_ACCESS_TOKEN: "pin_12345678901234567890123456",
    AMS_PINTEREST_BOARD_ID: "replace-with-pinterest-board-id",
    AMS_YOUTUBE_CLIENT_ID: "youtube-client-12345678901234567890",
    AMS_YOUTUBE_CLIENT_SECRET: "youtube-secret-123456789012345678",
    AMS_YOUTUBE_REFRESH_TOKEN: "youtube-refresh-123456789012345678",
    AMS_YOUTUBE_CHANNEL_ID: "UC1234567890123456789012",
  } as NodeJS.ProcessEnv

  assert.deepEqual(getSocialPublisherConfiguration(env), {
    linkedin: true,
    facebook: false,
    instagram: true,
    pinterest: false,
    "youtube-shorts": false,
  })
})

test("Instagram publishes the approved media URL without replacing the destination URL", async () => {
  const calls: Array<{ url: string; body: string }> = []
  const fetcher = (async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(input), body: String(init?.body ?? "") })
    const id = calls.length === 1 ? "creation-123" : "instagram-post-456"
    return new Response(JSON.stringify({ id }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }) as typeof fetch

  const record = approvedRecord("instagram")
  const result = await publishSocialChannel(record, "instagram", {
    fetch: fetcher,
    env: {
      AMS_META_ACCESS_TOKEN: "meta_1234567890123456789012345",
      AMS_META_GRAPH_API_VERSION: "v24.0",
      AMS_INSTAGRAM_USER_ID: "instagram_12345",
    } as NodeJS.ProcessEnv,
  })

  assert.equal(result.status, "published")
  assert.equal(result.externalId, "instagram-post-456")
  assert.equal(calls.length, 2)
  const createBody = new URLSearchParams(calls[0].body)
  assert.equal(createBody.get("image_url"), validInput.mediaUrl)
  assert.match(createBody.get("caption") ?? "", /quick-marketing-audit/u)
  assert.notEqual(createBody.get("image_url"), validInput.destinationUrl)
})

test("Pinterest uses separate media/link URLs and enforces provider text limits", async () => {
  let payload: Record<string, unknown> | null = null
  const fetcher = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
    return new Response(JSON.stringify({ id: "pin-123" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }) as typeof fetch

  const record = approvedRecord("pinterest", {
    draft: {
      title: "T".repeat(180),
      body: "B".repeat(1_200),
    },
  })
  const result = await publishSocialChannel(record, "pinterest", {
    fetch: fetcher,
    env: {
      AMS_PINTEREST_ACCESS_TOKEN: "pin_12345678901234567890123456",
      AMS_PINTEREST_BOARD_ID: "board_123456",
    } as NodeJS.ProcessEnv,
  })

  assert.equal(result.status, "published")
  assert.equal(result.externalId, "pin-123")
  assert.ok(payload)
  assert.equal(String(payload!.title).length, 100)
  assert.equal(String(payload!.description).length, 800)
  assert.equal(payload!.link, validInput.destinationUrl)
  assert.equal((payload!.media_source as { url: string }).url, validInput.mediaUrl)
})

test("provider timeout remains active while a response body is being consumed", async () => {
  const stalledResponse = {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: () => new Promise<unknown>(() => undefined),
  } as Response
  const fetcher = (async () => stalledResponse) as typeof fetch
  const record = approvedRecord("facebook")

  const result = await publishSocialChannel(record, "facebook", {
    fetch: fetcher,
    timeoutMs: 10,
    env: {
      AMS_META_ACCESS_TOKEN: "meta_1234567890123456789012345",
      AMS_META_GRAPH_API_VERSION: "v24.0",
      AMS_FACEBOOK_PAGE_ID: "facebook_12345",
    } as NodeJS.ProcessEnv,
  })

  assert.equal(result.status, "failed")
  assert.equal(result.errorCode, "FACEBOOK_PUBLISH_TIMEOUT")
})
