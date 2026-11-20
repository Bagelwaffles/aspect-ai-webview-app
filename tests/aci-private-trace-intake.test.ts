import assert from "node:assert/strict"
import test from "node:test"

import {
  inspectAciPrivateTraceManifest,
  type AciPrivateTraceManifest,
} from "../lib/aci/private-trace-intake"

const now = new Date("2026-11-10T20:00:00.000Z")

function manifest(): AciPrivateTraceManifest {
  const shared = {
    caseId: "content-draft-no-publication",
    agentSlug: "content-agent",
    sourceEnvironment: "preview" as const,
    observedAt: "2026-11-10T18:15:00.000Z",
    reviewedAt: "2026-11-10T19:10:00.000Z",
    reviewerRole: "owner" as const,
    outcome: "completed" as const,
    attestations: {
      ownerAuthorized: true as const,
      sourceReviewed: true as const,
      personalAndCustomerDataExcluded: true as const,
      secretsAndCredentialsExcluded: true as const,
      rawPromptsAndOutputsExcluded: true as const,
      sourceMappingRetainedPrivately: true as const,
    },
  }
  return {
    version: 1,
    purpose: "offline_private_evidence_review",
    records: [
      {
        ...shared,
        stage: "baseline",
        repoSha: "a".repeat(40),
        sourceProofDigest: "c".repeat(64),
      },
      {
        ...shared,
        stage: "candidate",
        repoSha: "b".repeat(40),
        sourceProofDigest: "d".repeat(64),
      },
    ],
  }
}

function altered(): { records: Array<Record<string, unknown>>; [key: string]: unknown } {
  return structuredClone(manifest()) as unknown as {
    records: Array<Record<string, unknown>>
    [key: string]: unknown
  }
}

test("owner-attested private metadata does not prove a real trace or permit scoring", () => {
  const report = inspectAciPrivateTraceManifest(manifest(), now)
  assert.equal(report.accepted, true)
  assert.equal(report.recordCount, 2)
  assert.equal(report.status, "metadata_only_unverified")
  assert.equal(report.classification, "restricted_private_metadata")
  assert.equal(report.sourceAuthenticityVerified, false)
  assert.equal(report.readyForScoring, false)
  assert.equal(report.productionApproved, false)
})

test("raw prompts, personal information or unexpected fields fail closed", () => {
  const input = altered()
  input.records[0].rawPrompt = "customer private message must not be accepted"
  const report = inspectAciPrivateTraceManifest(input, now)
  assert.equal(report.accepted, false)
  assert.ok(report.reasons.includes("INVALID_OR_UNEXPECTED_RECORD_FIELDS"))

  const topLevel = altered()
  topLevel.customerEmail = "example@invalid.test"
  assert.ok(inspectAciPrivateTraceManifest(topLevel, now).reasons.includes("INVALID_OR_UNEXPECTED_MANIFEST_FIELDS"))
})

test("missing owner authorization, reviewer disclosure or privacy attestations fail closed", () => {
  for (const attestation of [
    "ownerAuthorized",
    "sourceReviewed",
    "personalAndCustomerDataExcluded",
    "secretsAndCredentialsExcluded",
    "rawPromptsAndOutputsExcluded",
    "sourceMappingRetainedPrivately",
  ]) {
    const input = altered()
    const review = input.records[0].attestations as Record<string, unknown>
    review[attestation] = false
    const report = inspectAciPrivateTraceManifest(input, now)
    assert.equal(report.accepted, false, attestation)
    assert.ok(report.reasons.includes("MISSING_PRIVACY_OR_AUTHORIZATION_ATTESTATION"))
  }
})

test("owner identity and model-consent extras cannot be smuggled into a record", () => {
  const input = altered()
  ;(input.records[0].attestations as Record<string, unknown>).approvedTraining = true
  assert.ok(inspectAciPrivateTraceManifest(input, now).reasons.includes("MISSING_PRIVACY_OR_AUTHORIZATION_ATTESTATION"))

  const injected = altered()
  injected.records[0].reviewerEmail = "personal@example.invalid"
  assert.ok(inspectAciPrivateTraceManifest(injected, now).reasons.includes("INVALID_OR_UNEXPECTED_RECORD_FIELDS"))
})

test("unknown or fabricated AMS agents are rejected", () => {
  const input = altered()
  input.records[0].agentSlug = "agent-that-does-not-exist"
  assert.ok(inspectAciPrivateTraceManifest(input, now).reasons.includes("UNKNOWN_AGENT"))
})

test("baseline and candidate require distinct source versions and actual paired stages", () => {
  const sameSha = altered()
  sameSha.records[1].repoSha = sameSha.records[0].repoSha
  assert.ok(inspectAciPrivateTraceManifest(sameSha, now).reasons.includes("UNVERSIONED_COMPARISON"))

  const duplicateStage = altered()
  duplicateStage.records[1].stage = "baseline"
  const report = inspectAciPrivateTraceManifest(duplicateStage, now)
  assert.ok(report.reasons.includes("DUPLICATE_CASE_STAGE"))
  assert.ok(report.reasons.includes("UNPAIRED_CASE"))
})

test("cross-agent comparisons are not accepted", () => {
  const input = altered()
  input.records[1].agentSlug = "marketing-audit-agent"
  assert.ok(inspectAciPrivateTraceManifest(input, now).reasons.includes("CROSS_AGENT_COMPARISON"))
})

test("two stages cannot reuse the same private proof digest", () => {
  const input = altered()
  input.records[1].sourceProofDigest = input.records[0].sourceProofDigest
  assert.ok(inspectAciPrivateTraceManifest(input, now).reasons.includes("REUSED_SOURCE_PROOF"))
})

test("untrusted or absent timestamps are rejected instead of becoming newer evidence", () => {
  const future = altered()
  future.records[1].observedAt = "2026-11-12T19:00:00.000Z"
  assert.ok(inspectAciPrivateTraceManifest(future, now).reasons.includes("INVALID_OR_STALE_TRACE_TIMESTAMPS"))

  const invalid = altered()
  invalid.records[0].reviewedAt = "2026-02-30T19:00:00.000Z"
  assert.ok(inspectAciPrivateTraceManifest(invalid, now).reasons.includes("INVALID_OR_STALE_TRACE_TIMESTAMPS"))

  const outOfOrder = altered()
  outOfOrder.records[0].reviewedAt = "2026-11-10T17:00:00.000Z"
  assert.ok(inspectAciPrivateTraceManifest(outOfOrder, now).reasons.includes("INVALID_OR_STALE_TRACE_TIMESTAMPS"))
})

test("fabricated live-payment success and unspecified reviewer role fail validation", () => {
  const input = altered()
  input.records[0].outcome = "live_payment_verified"
  input.records[0].reviewerRole = "autonomous_agent"
  const report = inspectAciPrivateTraceManifest(input, now)
  assert.ok(report.reasons.includes("INVALID_OUTCOME"))
  assert.ok(report.reasons.includes("INVALID_REVIEW_ROLE"))
})

test("a private manifest cannot authorize model training, public publishing or deployment", () => {
  const input = altered()
  input.purpose = "production_learning"
  assert.ok(inspectAciPrivateTraceManifest(input, now).reasons.includes("INVALID_MANIFEST_VERSION_OR_PURPOSE"))
  const report = inspectAciPrivateTraceManifest(manifest(), now)
  assert.equal(report.productionApproved, false)
  assert.equal(report.sourceAuthenticityVerified, false)
  assert.equal(report.readyForScoring, false)
})
