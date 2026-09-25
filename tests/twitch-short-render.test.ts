import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  authorizeMediaWorker,
  isTwitchShortRenderConfigured,
  twitchShortRenderJobSchema,
  validateGitHubActionsWorkerClaims,
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

test("media worker keeps the exact bearer secret as a fallback", async () => {
  assert.equal(await authorizeMediaWorker(`Bearer ${workerSecret}`, configuredEnv), true)
  assert.equal(await authorizeMediaWorker(null, configuredEnv), false)
  assert.equal(await authorizeMediaWorker(workerSecret, configuredEnv), false)
})

test("GitHub Actions worker claims are pinned to the production Twitch workflow", () => {
  const now = Date.parse("2026-09-22T02:30:00.000Z")
  const valid = {
    iss: "https://token.actions.githubusercontent.com",
    aud: "ams-twitch-worker",
    sub: "repo:Bagelwaffles/aspect-ai-webview-app:environment:production",
    exp: Math.floor(now / 1000) + 300,
    nbf: Math.floor(now / 1000) - 5,
    iat: Math.floor(now / 1000) - 5,
    repository: "Bagelwaffles/aspect-ai-webview-app",
    repository_id: "1026496028",
    ref: "refs/heads/main",
    workflow: "Twitch Short Render Worker",
    workflow_ref: "Bagelwaffles/aspect-ai-webview-app/.github/workflows/twitch-short-render-worker.yml@refs/heads/main",
    event_name: "schedule",
    environment: "production",
    runner_environment: "github-hosted",
  }
  assert.equal(validateGitHubActionsWorkerClaims(valid, now), true)
  assert.equal(validateGitHubActionsWorkerClaims({ ...valid, repository: "other/repo" }, now), false)
  assert.equal(validateGitHubActionsWorkerClaims({ ...valid, ref: "refs/heads/feature" }, now), false)
  assert.equal(validateGitHubActionsWorkerClaims({ ...valid, event_name: "pull_request" }, now), false)
  assert.equal(validateGitHubActionsWorkerClaims({ ...valid, exp: Math.floor(now / 1000) - 120 }, now), false)
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


test("renderer wraps overlay copy inside vertical-video safe margins", () => {
  const renderer = readFileSync("scripts/render_twitch_short.py", "utf8")
  assert.match(renderer, /width=28, max_lines=3/)
  assert.match(renderer, /width=42, max_lines=3/)
  assert.match(renderer, /Style: Hook[^\n]*,96,96,190,1/)
  assert.match(renderer, /Style: Caption[^\n]*,96,96,220,1/)
})
