import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"

import {
  getSmokyYouTubeVodUploadConfiguration,
  validateSmokyVodSourceObjectKey,
} from "../lib/server/smoky-youtube-vod-jobs"
import { getSmokyYouTubeConfiguration } from "../lib/server/smoky-youtube-uploader"

test("Smoky YouTube credentials can be configured while automatic Shorts remain disabled", () => {
  const config = getSmokyYouTubeConfiguration({
    NODE_ENV: "test",
    AMS_SMOKY_YOUTUBE_AUTO_UPLOAD_ENABLED: "false",
    AMS_SMOKY_YOUTUBE_CLIENT_ID: "client-123456789012345678901234567890",
    AMS_SMOKY_YOUTUBE_CLIENT_SECRET: "secret-123456789012345678901234567890",
    AMS_SMOKY_YOUTUBE_REFRESH_TOKEN: "refresh-123456789012345678901234567890",
    AMS_SMOKY_YOUTUBE_EXPECTED_CHANNEL_ID: "UC1234567890123456789012",
  })
  assert.equal(config.enabled, false)
  assert.equal(config.configured, true)
})

test("full VOD source is restricted to SmokyBanana03-owned VOD objects", () => {
  assert.equal(
    validateSmokyVodSourceObjectKey(
      "creators/twitch/155477801/stream-1/vods/1234567890/full.mp4",
    ),
    "creators/twitch/155477801/stream-1/vods/1234567890/full.mp4",
  )

  assert.throws(
    () => validateSmokyVodSourceObjectKey(
      "creators/twitch/999999999/stream-1/vods/1234567890/full.mp4",
    ),
    /SMOKY_VOD_SOURCE_OBJECT_INVALID/u,
  )
  assert.throws(
    () => validateSmokyVodSourceObjectKey(
      "creators/twitch/155477801/stream-1/clips/clip-1/full.mp4",
    ),
    /SMOKY_VOD_SOURCE_OBJECT_INVALID/u,
  )
  assert.throws(
    () => validateSmokyVodSourceObjectKey(
      "creators/twitch/155477801/stream-1/vods/../secret.mp4",
    ),
    /SMOKY_VOD_SOURCE_OBJECT_INVALID/u,
  )
})

test("full VOD upload remains disabled unless its dedicated worker gate is enabled", () => {
  assert.deepEqual(
    getSmokyYouTubeVodUploadConfiguration({ NODE_ENV: "test" }),
    { enabled: false, configured: false },
  )
})

test("VOD worker implements ranged source reads and resumable YouTube status checks", () => {
  const worker = readFileSync("scripts/upload_smoky_youtube_vod.py", "utf8")
  assert.match(worker, /CHUNK_SIZE = 16 \* 1024 \* 1024/u)
  assert.match(worker, /Range.*bytes=\{start\}-\{end\}/u)
  assert.match(worker, /Content-Range.*bytes \*\/\{total_bytes\}/u)
  assert.match(worker, /status == 308/u)
  assert.match(worker, /YOUTUBE_UPLOAD_FINAL_STATE_UNCERTAIN/u)
  assert.match(worker, /privacy/u, "worker should be paired with private-only server session policy")
})

test("VOD GitHub worker is OIDC-scoped and never receives permanent Google secrets", () => {
  const workflow = readFileSync(".github/workflows/smoky-youtube-vod-upload-worker.yml", "utf8")
  assert.match(workflow, /id-token:\s*write/u)
  assert.match(workflow, /AMS_WORKER_AUDIENCE:\s*ams-twitch-worker/u)
  assert.doesNotMatch(workflow, /AMS_SMOKY_YOUTUBE_CLIENT_SECRET/u)
  assert.doesNotMatch(workflow, /AMS_SMOKY_YOUTUBE_REFRESH_TOKEN/u)
})
