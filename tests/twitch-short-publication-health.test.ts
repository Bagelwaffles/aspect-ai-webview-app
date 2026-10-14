import assert from "node:assert/strict"
import test from "node:test"
import {
  summarizeTwitchShortPublicationHealth,
  type TwitchShortPublicationState,
} from "@/lib/server/twitch-short-publication-health"

const now = new Date("2026-10-14T16:00:00Z")
const baseline: TwitchShortPublicationState = {
  jobId: "selected-short",
  selectedAt: "2026-10-14T11:00:00Z",
  renderedAt: "2026-10-14T11:30:00Z",
  privateStatus: "succeeded",
  privateCompletedAt: "2026-10-14T12:00:00Z",
  privateVerified: true,
  publicStatus: null,
  publicUpdatedAt: null,
}

test("verified Private auto-selected Short overdue for Public is reported, never published by the monitor", () => {
  const summary = summarizeTwitchShortPublicationHealth([baseline], now)
  assert.equal(summary.verifiedPrivateOverdue, 1)
  assert.equal(summary.published, 0)
  assert.deepEqual(summary.affectedJobIds, ["selected-short"])
})

test("recent uploads get a grace period and proven public promotion is a success", () => {
  const recent = { ...baseline, privateCompletedAt: "2026-10-14T15:00:00Z" }
  const publicRow = { ...baseline, jobId: "done", publicStatus: "succeeded" as const }
  const summary = summarizeTwitchShortPublicationHealth([recent, publicRow], now)
  assert.equal(summary.waiting, 1)
  assert.equal(summary.published, 1)
  assert.equal(summary.verifiedPrivateOverdue, 0)
})

test("failed uploads and stale ambiguous updates warn but do not trigger retries", () => {
  const summary = summarizeTwitchShortPublicationHealth([
    { ...baseline, jobId: "upload-failed", privateStatus: "failed" },
    { ...baseline, jobId: "public-uncertain", publicStatus: "reconciliation", publicUpdatedAt: "2026-10-14T12:01:00Z" },
    { ...baseline, jobId: "private-uncertain", privateStatus: "uploading", publicUpdatedAt: null },
    { ...baseline, jobId: "not-yet-uploaded", privateStatus: null, privateCompletedAt: null },
  ], now)
  assert.equal(summary.failed, 1)
  assert.equal(summary.reconciliationStalled, 2)
  assert.equal(summary.uploadOverdue, 1)
  assert.equal(summary.published, 0)
})

test("private upload without trusted metadata proof cannot be treated as publication-ready", () => {
  const summary = summarizeTwitchShortPublicationHealth([
    { ...baseline, privateVerified: false },
  ], now)
  assert.equal(summary.verifiedPrivateOverdue, 0)
  assert.equal(summary.waiting, 1)
  assert.equal(summary.affectedJobIds.length, 0)
})

test("an empty queue is healthy and a recent ambiguous attempt is not stale", () => {
  assert.equal(summarizeTwitchShortPublicationHealth([], now).selected, 0)
  const summary = summarizeTwitchShortPublicationHealth([
    { ...baseline, publicStatus: "reconciliation", publicUpdatedAt: "2026-10-14T15:45:00Z" },
  ], now)
  assert.equal(summary.reconciliationStalled, 0)
  assert.equal(summary.waiting, 1)
})
