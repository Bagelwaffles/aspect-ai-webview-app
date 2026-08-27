import assert from "node:assert/strict"
import test from "node:test"

import {
  socialCampaignInputSchema,
  socialCampaignOutputSchema,
} from "../lib/server/social-campaign-agent"
import { getSocialPublisherConfiguration } from "../lib/server/social-publisher"

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
  ] as const
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))

  try {
    for (const key of keys) delete process.env[key]
    assert.deepEqual(getSocialPublisherConfiguration(), {
      linkedin: false,
      facebook: false,
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
