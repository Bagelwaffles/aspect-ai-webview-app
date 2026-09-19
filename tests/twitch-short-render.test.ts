import assert from "node:assert/strict"
import test from "node:test"

import {
  authorizeMediaWorker,
  isTwitchShortRenderConfigured,
  twitchShortRenderJobSchema,
} from "../lib/server/twitch-short-render-jobs"

const workerSecret = "test-worker-secret-that-is-at-least-32-chars"

const configuredEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  AMS_TWITCH_SHORT_RENDER_ENABLED: "true",
  AMS_MEDIA_WORKER_KEY: workerSecret,
  UPSTASH_REDIS_REST_URL: "https://example-upstash.test",
  UPSTASH_REDIS_REST_TOKEN: "test-token",
  AMS_ASSET_R2_ACCOUNT_ID: "1234567890abcdef1234567890abcdef",
  AMS_ASSET_R2_ACCESS_KEY_ID: "TESTACCESSKEY123",
  AMS_ASSET_R2_SECRET_ACCESS_KEY: "test-r2-secret",
  AMS_ASSET_R2_BUCKET: "ams-customer-assets",
}

test("Short renderer fails closed until every storage and worker gate is configured", () => {
  assert.equal(isTwitchShortRenderConfigured(configuredEnv), true)
  assert.equal(isTwitchShortRenderConfigured({ ...configuredEnv, AMS_TWITCH_SHORT_RENDER_ENABLED: "false" }), false)
  assert.equal(isTwitchShortRenderConfigured({ ...configuredEnv, AMS_MEDIA_WORKER_KEY: "" }), false)
  assert.equal(isTwitchShortRenderConfigured({ ...configuredEnv, UPSTASH_REDIS_REST_TOKEN: "" }), false)
  assert.equal(isTwitchShortRenderConfigured({ ...configuredEnv, AMS_ASSET_R2_BUCKET: "" }), false)
})

test("media worker requires the exact bearer secret", () => {
  assert.equal(authorizeMediaWorker(`Bearer ${workerSecret}`, configuredEnv), true)
  assert.equal(authorizeMediaWorker("Bearer wrong-secret", configuredEnv), false)
  assert.equal(authorizeMediaWorker(null, configuredEnv), false)
  assert.equal(authorizeMediaWorker(workerSecret, configuredEnv), false)
})

test("render job schema keeps drafts private and bounded", () => {
  const parsed = twitchShortRenderJobSchema.parse({
    version: "twitch-short-render-v1",
    jobId: "job-1",
    streamId: "stream-1",
    broadcasterId: "155477801",
    clipId: "clip-1",
    sourceObjectKey: "creators/twitch/155477801/stream-1/clips/clip-1/landscape.mp4",
    outputObjectKey: "creators/twitch/155477801/stream-1/shorts/clip-1.mp4",
    status: "pending",
    attempts: 0,
    createdAt: "2026-09-19T00:00:00.000Z",
    updatedAt: "2026-09-19T00:00:00.000Z",
    claimedAt: null,
    completedAt: null,
    errorCode: null,
    shortDraft: {
      title: "COD test Short",
      hook: "Wait for this play.",
      caption: "Call of Duty test clip.",
      hashtags: ["#CallOfDuty", "#Shorts"],
    },
  })
  assert.equal(parsed.status, "pending")
  assert.match(parsed.outputObjectKey, /\/shorts\/clip-1\.mp4$/)
  assert.equal("publish" in parsed, false)
})
