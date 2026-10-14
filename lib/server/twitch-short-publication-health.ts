/**
 * Read-only health classification for already auto-selected SmokyBanana03 Shorts.
 * This module does not upload, edit privacy, or choose videos for publication.
 */
export const TWITCH_SHORT_PUBLICATION_OVERDUE_MS = 3 * 60 * 60 * 1000

export type TwitchShortPublicationState = {
  jobId: string
  selectedAt: string
  renderedAt: string | null
  privateStatus: "pending" | "uploading" | "succeeded" | "failed" | "reconciliation" | null
  privateCompletedAt: string | null
  privateVerified: boolean
  publicStatus: "pending" | "promoting" | "succeeded" | "failed" | "reconciliation" | null
  publicUpdatedAt: string | null
}

export type TwitchShortPublicationHealth = {
  selected: number
  published: number
  failed: number
  uploadOverdue: number
  verifiedPrivateOverdue: number
  reconciliationStalled: number
  waiting: number
  affectedJobIds: string[]
}

/** A delayed worker cycle is normal; warn only after a three-hour grace period. */
export function summarizeTwitchShortPublicationHealth(
  states: ReadonlyArray<TwitchShortPublicationState>,
  now: Date,
): TwitchShortPublicationHealth {
  const summary: TwitchShortPublicationHealth = {
    selected: states.length,
    published: 0,
    failed: 0,
    uploadOverdue: 0,
    verifiedPrivateOverdue: 0,
    reconciliationStalled: 0,
    waiting: 0,
    affectedJobIds: [],
  }
  for (const row of states) {
    if (row.publicStatus === "succeeded") {
      summary.published++
      continue
    }
    if (row.privateStatus === "failed" || row.publicStatus === "failed") {
      summary.failed++
      summary.affectedJobIds.push(row.jobId)
      continue
    }

    const since = row.publicUpdatedAt ?? row.privateCompletedAt ?? row.renderedAt ?? row.selectedAt
    const timestamp = Date.parse(since)
    const overdue = Number.isFinite(timestamp) &&
      now.getTime() - timestamp >= TWITCH_SHORT_PUBLICATION_OVERDUE_MS
    if (!overdue) {
      summary.waiting++
      continue
    }
    if (
      row.publicStatus === "promoting" ||
      row.publicStatus === "reconciliation" ||
      row.privateStatus === "reconciliation" ||
      row.privateStatus === "uploading"
    ) {
      summary.reconciliationStalled++
      summary.affectedJobIds.push(row.jobId)
    } else if (row.privateStatus === "succeeded" && row.privateVerified) {
      summary.verifiedPrivateOverdue++
      summary.affectedJobIds.push(row.jobId)
    } else if (row.privateStatus !== "succeeded") {
      summary.uploadOverdue++
      summary.affectedJobIds.push(row.jobId)
    } else {
      // Missing or incomplete YouTube metadata proof is not publication consent.
      summary.waiting++
    }
  }
  return summary
}
