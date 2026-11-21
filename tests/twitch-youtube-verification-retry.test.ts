import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const route = readFileSync(
  new URL("../app/api/internal/twitch/media/render/youtube/verify/route.ts", import.meta.url),
  "utf8",
)
const workflow = readFileSync(
  new URL("../.github/workflows/twitch-short-render-worker.yml", import.meta.url),
  "utf8",
)

test("recheck endpoint is protected, Private-only and has no upload or privacy mutation path", () => {
  assert.match(route, /authorizeMediaWorker\(/u)
  assert.match(route, /requestSchema\.safeParse/u)
  assert.match(route, /record\?\.status !== "succeeded"/u)
  assert.match(route, /record\.channelId !== SMOKYBANANA03_YOUTUBE_CHANNEL_ID/u)
  assert.match(route, /verifyRenderedTwitchShortPrivate/u)
  assert.match(route, /pending \? 202 : 409/u)
  assert.doesNotMatch(route, /uploadRenderedTwitchShortPrivate|promoteRenderedTwitchShortPublic|videos\.insert|videos\.update|method:\s*["']PUT["']/u)
})

test("post-upload retries never reissue videos.insert and are bounded to 60 seconds of sleeps", () => {
  assert.match(workflow, /id: private_upload/u)
  assert.match(workflow, /id: verify_retry/u)
  assert.match(workflow, /if: steps\.private_upload\.outputs\.verification_pending == 'true'/u)
  assert.match(workflow, /for delay in 10 20 30; do/u)
  assert.match(workflow, /\/api\/internal\/twitch\/media\/render\/youtube\/verify/u)
  assert.match(workflow, /\.videoId == \$videoId/u)
  assert.match(workflow, /\.pendingVerification == false/u)
  assert.match(workflow, /\.metadataVerified == true/u)
  assert.match(workflow, /\.categoryId == "20"/u)
  assert.match(workflow, /\.privacyStatus == "private"/u)
  assert.match(workflow, /\.code == "YOUTUBE_UPLOAD_METADATA_TAGS_MISMATCH"/u)
})

test("existing guarded Public route runs only after verified Private proof", () => {
  assert.match(workflow, /name: Attempt same-run guarded Public promotion/u)
  assert.match(workflow, /if: steps\.private_upload\.outputs\.verified == 'true' \|\| steps\.verify_retry\.outputs\.verified == 'true'/u)
  assert.match(workflow, /\/api\/internal\/twitch\/media\/render\/youtube\/public\/auto/u)
  assert.doesNotMatch(route, /public\/auto|privacyStatus: "public"/u)
})
