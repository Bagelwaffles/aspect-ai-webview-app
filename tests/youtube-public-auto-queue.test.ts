import assert from "node:assert/strict"
import test from "node:test"

import { reconcileNextEligiblePublicPromotion } from "../lib/server/youtube-public-auto-queue"

type Candidate = { jobId: string; autoPublish: { sourceVideoId: string } }
const candidate = (jobId: string, sourceVideoId: string): Candidate => ({
  jobId, autoPublish: { sourceVideoId },
})

function dependencies(overrides: {
  promotion?: (jobId: string) => Promise<string>
  record?: (jobId: string) => Promise<{ status: string; attempts: number } | null>
  privateUpload?: (jobId: string) => Promise<{ status: string; youtubeVideoId: string | null } | null>
  proof?: (jobId: string) => Promise<{ videoId: string; metadataVerified: boolean } | null>
} = {}) {
  return {
    getPromotionRecord: overrides.record ?? (async () => null),
    getPrivateUpload: overrides.privateUpload ?? (async (jobId: string) => ({
      status: "succeeded", youtubeVideoId: "yt-" + jobId,
    })),
    getVerificationProof: overrides.proof ?? (async (jobId: string) => ({
      videoId: "yt-" + jobId, metadataVerified: true,
    })),
    promote: overrides.promotion ?? (async (jobId: string) => jobId),
  }
}

test("capped Twitch stream is skipped, and a distinct eligible stream is still processed", async () => {
  const attempted: string[] = []
  const result = await reconcileNextEligiblePublicPromotion(
    [
      candidate("capped-1", "2899034885"),
      candidate("capped-2", "2899034885"),
      candidate("eligible-1", "2898440745"),
    ],
    dependencies({
      promotion: async (jobId) => {
        attempted.push(jobId)
        if (jobId === "capped-1") throw new Error("YOUTUBE_PUBLIC_STREAM_CAP_REACHED")
        return jobId
      },
    }),
  )

  assert.deepEqual(attempted, ["capped-1", "eligible-1"])
  assert.equal(result.outcome, "eligible-1")
  assert.deepEqual(result.cappedSourceVideoIds, ["2899034885"])
})

test("fully capped queue ends normally without retrying more Shorts from the same stream", async () => {
  const attempted: string[] = []
  const result = await reconcileNextEligiblePublicPromotion(
    [candidate("capped-1", "2899034885"), candidate("capped-2", "2899034885")],
    dependencies({
      promotion: async (jobId) => {
        attempted.push(jobId)
        throw new Error("YOUTUBE_PUBLIC_STREAM_CAP_REACHED")
      },
    }),
  )
  assert.deepEqual(attempted, ["capped-1"])
  assert.equal(result.outcome, null)
  assert.deepEqual(result.cappedSourceVideoIds, ["2899034885"])
})

test("unrelated promotion errors remain fatal and do not get disguised as stream caps", async () => {
  await assert.rejects(
    reconcileNextEligiblePublicPromotion(
      [candidate("job-1", "vod-1"), candidate("job-2", "vod-2")],
      dependencies({ promotion: async () => { throw new Error("YOUTUBE_PUBLIC_RECONCILIATION_REQUIRED") } }),
    ),
    /YOUTUBE_PUBLIC_RECONCILIATION_REQUIRED/u,
  )
})

test("only independently verified private uploads reach the promoter", async () => {
  let calls = 0
  const result = await reconcileNextEligiblePublicPromotion(
    [candidate("wrong-video", "vod-1"), candidate("valid-video", "vod-2")],
    dependencies({
      proof: async (id) => ({
        videoId: id === "wrong-video" ? "different-video" : "yt-" + id,
        metadataVerified: true,
      }),
      promotion: async (id) => { calls += 1; return id },
    }),
  )
  assert.equal(calls, 1)
  assert.equal(result.outcome, "valid-video")
})

test("terminal failures are skipped; ambiguous status still permits readback at retry ceiling", async () => {
  const calls: string[] = []
  const result = await reconcileNextEligiblePublicPromotion(
    [candidate("failed", "vod-1"), candidate("ambiguous", "vod-2")],
    dependencies({
      record: async (id) => ({ status: id === "failed" ? "failed" : "reconciliation", attempts: 3 }),
      promotion: async (id) => { calls.push(id); return id },
    }),
  )
  assert.deepEqual(calls, ["ambiguous"])
  assert.equal(result.outcome, "ambiguous")
})
