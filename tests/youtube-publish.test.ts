import assert from "node:assert/strict"
import test from "node:test"

import {
  isAllowedYouTubeSourceUrl,
  parseYouTubePublishInput,
  YouTubePublisherError,
} from "../lib/server/youtube-publisher"

test("allows the default HeyGen source hosts", () => {
  assert.equal(isAllowedYouTubeSourceUrl("https://files2.heygen.ai/video.mp4"), true)
  assert.equal(isAllowedYouTubeSourceUrl("https://resource2.heygen.ai/video.mp4"), true)
  assert.equal(isAllowedYouTubeSourceUrl("https://dynamic.heygen.ai/thumb.png"), true)
})

test("rejects non-https and non-allowlisted sources", () => {
  assert.equal(isAllowedYouTubeSourceUrl("http://files2.heygen.ai/video.mp4"), false)
  assert.equal(isAllowedYouTubeSourceUrl("https://localhost/video.mp4"), false)
  assert.equal(isAllowedYouTubeSourceUrl("https://example.com/video.mp4"), false)
})

test("uses private and Science & Technology safe defaults", () => {
  const parsed = parseYouTubePublishInput({
    videoUrl: "https://resource2.heygen.ai/video.mp4",
    title: "AMS launch",
  })

  assert.equal(parsed.privacyStatus, "private")
  assert.equal(parsed.categoryId, "28")
  assert.equal(parsed.madeForKids, false)
  assert.equal(parsed.notifySubscribers, false)
  assert.deepEqual(parsed.tags, [])
})

test("rejects a thumbnail outside the source allowlist", () => {
  assert.throws(
    () =>
      parseYouTubePublishInput({
        videoUrl: "https://resource2.heygen.ai/video.mp4",
        thumbnailUrl: "https://example.com/thumb.png",
        title: "AMS launch",
      }),
    (error) => error instanceof YouTubePublisherError && error.code === "YOUTUBE_THUMBNAIL_SOURCE_FORBIDDEN",
  )
})
