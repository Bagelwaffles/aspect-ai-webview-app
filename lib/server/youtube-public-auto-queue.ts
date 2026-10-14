// Scans one reconciled public-promotion candidate at a time.
// A stream with three previously recorded Public promotions is complete, not a
// global queue failure. Other errors must still fail closed.
type PromotionCandidate = {
  jobId: string
  autoPublish?: { sourceVideoId: string } | null
}

type PromotionRecord = { status: string; attempts: number }
type PrivateUpload = { status: string; youtubeVideoId: string | null }
type VerificationProof = { videoId: string; metadataVerified: boolean }

type Dependencies<TResult> = {
  getPromotionRecord: (renderJobId: string) => Promise<PromotionRecord | null>
  getPrivateUpload: (renderJobId: string) => Promise<PrivateUpload | null>
  getVerificationProof: (renderJobId: string) => Promise<VerificationProof | null>
  promote: (renderJobId: string) => Promise<TResult>
}

const MAX_PUBLIC_PROMOTION_ATTEMPTS = 3

export async function reconcileNextEligiblePublicPromotion<TResult>(
  jobs: readonly PromotionCandidate[],
  dependencies: Dependencies<TResult>,
): Promise<{ outcome: TResult | null; cappedSourceVideoIds: string[] }> {
  const cappedSources = new Set<string>()

  for (const job of jobs) {
    const sourceVideoId = job.autoPublish?.sourceVideoId
    if (!sourceVideoId || cappedSources.has(sourceVideoId)) continue

    const existing = await dependencies.getPromotionRecord(job.jobId)
    if (existing?.status === "succeeded") continue

    // An ambiguous PUT can already have succeeded. Readback-only
    // reconciliation is allowed even at the retry ceiling.
    const ambiguous = existing?.status === "promoting" || existing?.status === "reconciliation"
    if ((existing?.attempts ?? 0) >= MAX_PUBLIC_PROMOTION_ATTEMPTS && !ambiguous) continue

    const privateUpload = await dependencies.getPrivateUpload(job.jobId)
    if (privateUpload?.status !== "succeeded" || !privateUpload.youtubeVideoId) continue

    const proof = await dependencies.getVerificationProof(job.jobId)
    if (proof?.videoId !== privateUpload.youtubeVideoId || proof.metadataVerified !== true) continue

    try {
      const outcome = await dependencies.promote(job.jobId)
      return { outcome, cappedSourceVideoIds: [...cappedSources] }
    } catch (error) {
      // The promoter checks the persisted per-stream ledger before attempting
      // a YouTube status change. This stream cannot take more Public Shorts,
      // but must not prevent publication for another eligible stream.
      if (error instanceof Error && error.message === "YOUTUBE_PUBLIC_STREAM_CAP_REACHED") {
        cappedSources.add(sourceVideoId)
        continue
      }
      throw error
    }
  }

  return { outcome: null, cappedSourceVideoIds: [...cappedSources] }
}
