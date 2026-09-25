import assert from "node:assert/strict"
import test from "node:test"

import { buildTwitchAuthorizationUrl, TWITCH_BROADCAST_SCOPE, TWITCH_MEDIA_SCOPE, TWITCH_SCOPE } from "../lib/server/twitch-pilot"
import { autoApplySmokyLiveMetadata, getSmokyTwitchLiveMetadataConfiguration } from "../lib/server/twitch-live-metadata"
import type { StreamIntelligencePackage } from "../lib/server/stream-intelligence"

const oauthEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  PUBLIC_APP_URL: "https://www.aspectmarketingsolutions.app",
  AMS_TWITCH_CLIENT_ID: "client-id",
  AMS_TWITCH_CLIENT_SECRET: "client-secret",
  AMS_TWITCH_EVENTSUB_SECRET: "eventsub-secret",
}

function intelligence(login = "smokybanana03"): StreamIntelligencePackage {
  return {
    streamId: "stream-1",
    broadcasterLogin: login,
    phase: "live",
    generatedAt: "2026-09-25T21:00:00.000Z",
    generationMode: "deterministic-fallback",
    model: "deterministic-fallback",
    version: "stream-intelligence-v1",
    draft: {
      primarySearchPhrase: "Call of Duty gameplay",
      supportingKeywords: ["Call of Duty", "COD", "gaming", "FPS"],
      contentAngles: ["Live COD session", "FPS gameplay", "SmokyBanana03 live"],
      twitch: {
        titleOptions: ["Call of Duty Live | SmokyBanana03", "COD FPS Session", "Live COD Gameplay"],
        tagRecommendations: ["Call of Duty", "FPS", "Gaming"],
        goLiveCopy: "SmokyBanana03 is live with Call of Duty.",
      },
      youtube: {
        titleOptions: ["Call of Duty Gameplay | SmokyBanana03", "COD Highlights", "FPS Gaming"],
        description: "Metadata-backed gaming stream.",
        tags: ["Call of Duty", "COD", "gaming", "FPS", "SmokyBanana03"],
        hashtags: ["SmokyBanana03", "Gaming", "CallOfDuty"],
      },
      shortForm: {
        hooks: ["Hook one", "Hook two", "Hook three", "Hook four", "Hook five"],
        captions: ["Caption one", "Caption two", "Caption three"],
        hashtags: ["SmokyBanana03", "Gaming", "Shorts"],
      },
      social: {
        tiktokCaption: "TikTok caption",
        instagramCaption: "Instagram caption",
        xPost: "X post",
        discordAnnouncement: "Discord announcement",
      },
      thumbnailText: ["COD LIVE", "SMOKYBANANA03", "FPS"],
      approvalNotes: [],
      evidenceBoundary: "Built from Twitch metadata only.",
    },
  }
}

test("creator Twitch OAuth requests read, clip, and broadcast-management scopes together", () => {
  const url = buildTwitchAuthorizationUrl("state-123", oauthEnv, true, true)
  const scopes = new Set((url.searchParams.get("scope") ?? "").split(" ").filter(Boolean))
  assert.deepEqual(scopes, new Set([TWITCH_SCOPE, TWITCH_MEDIA_SCOPE, TWITCH_BROADCAST_SCOPE]))
  assert.equal(url.searchParams.get("force_verify"), "true")
})

test("live metadata auto-apply is fail-closed by default", async () => {
  assert.equal(getSmokyTwitchLiveMetadataConfiguration({ NODE_ENV: "test" }).enabled, false)
  const result = await autoApplySmokyLiveMetadata(intelligence(), {
    env: { NODE_ENV: "test" },
  })
  assert.equal(result.status, "disabled")
})

test("live metadata auto-apply refuses any creator other than SmokyBanana03", async () => {
  const result = await autoApplySmokyLiveMetadata(intelligence("someone-else"), {
    env: {
      NODE_ENV: "test",
      AMS_TWITCH_LIVE_METADATA_AUTO_APPLY: "true",
    },
  })
  assert.equal(result.status, "blocked")
  assert.equal(result.errorCode, "TWITCH_SMOKY_ACCOUNT_MISMATCH")
})
