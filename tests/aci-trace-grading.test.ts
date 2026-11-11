import assert from "node:assert/strict"
import test from "node:test"

import {
  gradeAciTracePairs,
  type AciTraceGradingInput,
  type AciTraceObservation,
} from "../lib/aci/trace-grading"
import type { AciPrivateTraceManifest } from "../lib/aci/private-trace-intake"

const now = new Date("2026-11-11T23:00:00.000Z")
const baselineSha = "a".repeat(40)
const candidateSha = "b".repeat(40)
const baselineDigest = "1".repeat(64)
const candidateDigest = "2".repeat(64)
const caseId = "content-agent-case-001"

function manifest(overrides: {
  candidateAgent?: string
  candidateEnvironment?: "preview" | "production"
  candidateSha?: string
  candidateDigest?: string
  duplicateDigest?: boolean
} = {}): AciPrivateTraceManifest {
  const attestations = {
    ownerAuthorized: true as const,
    sourceReviewed: true as const,
    personalAndCustomerDataExcluded: true as const,
    secretsAndCredentialsExcluded: true as const,
    rawPromptsAndOutputsExcluded: true as const,
    sourceMappingRetainedPrivately: true as const,
  }
  return {
    version: 1,
    purpose: "offline_private_evidence_review",
    records: [
      {
        caseId, agentSlug: "content-agent", stage: "baseline",
        repoSha: baselineSha, sourceEnvironment: "preview",
        sourceProofDigest: baselineDigest,
        observedAt: "2026-11-11T21:00:00.000Z",
        reviewedAt: "2026-11-11T22:00:00.000Z",
        reviewerRole: "owner", outcome: "failed", attestations,
      },
      {
        caseId, agentSlug: overrides.candidateAgent ?? "content-agent", stage: "candidate",
        repoSha: overrides.candidateSha ?? candidateSha,
        sourceEnvironment: overrides.candidateEnvironment ?? "preview",
        sourceProofDigest: overrides.duplicateDigest ? baselineDigest : overrides.candidateDigest ?? candidateDigest,
        observedAt: "2026-11-11T21:30:00.000Z",
        reviewedAt: "2026-11-11T22:00:00.000Z",
        reviewerRole: "owner", outcome: "completed", attestations,
      },
    ],
  }
}

function observation(stage: "baseline" | "candidate", overrides: Partial<AciTraceObservation> = {}): AciTraceObservation {
  const candidate = stage === "candidate"
  return {
    caseId,
    agentSlug: "content-agent",
    stage,
    repoSha: candidate ? candidateSha : baselineSha,
    sourceProofDigest: candidate ? candidateDigest : baselineDigest,
    taskClass: "source-grounded-content",
    taskSuccess: candidate,
    policyCompliant: true,
    schemaValid: true,
    requiresEvidence: true,
    grounded: candidate,
    evidenceRefCount: candidate ? 1 : 0,
    unsafeActionCount: 0,
    billedCostUsd: 0.02,
    durationMs: candidate ? 1500 : 2000,
    critical: false,
    ...overrides,
  }
}

function input(
  manifestOverrides: Parameters<typeof manifest>[0] = {},
  observations: AciTraceObservation[] = [observation("baseline"), observation("candidate")],
): AciTraceGradingInput {
  return {
    version: 1,
    purpose: "owner_attested_redacted_trace_scoring",
    manifest: manifest(manifestOverrides),
    observations,
  }
}

test("paired owner-attested redacted traces can produce a review candidate, never verified improvement", () => {
  const result = gradeAciTracePairs(input(), now)
  assert.equal(result.status, "owner_attested_candidate_for_review")
  assert.equal(result.agentSlug, "content-agent")
  assert.equal(result.baselineRepoSha, baselineSha)
  assert.equal(result.candidateRepoSha, candidateSha)
  assert.equal(result.baseline?.passed, 0)
  assert.equal(result.candidate?.passed, 1)
  assert.equal(result.candidate?.passRate, 1)
  assert.equal(result.candidate?.medianDurationMs, 1500)
  assert.equal(result.sourceAuthenticityVerified, false)
  assert.equal(result.independentPerformanceVerified, false)
  assert.equal(result.productionApproved, false)
  assert.equal(result.requiresIndependentReview, true)
})

test("unsafe candidate action rejects an otherwise improved pair", () => {
  const result = gradeAciTracePairs(input({}, [
    observation("baseline"),
    observation("candidate", { unsafeActionCount: 1 }),
  ]), now)
  assert.equal(result.status, "rejected")
  assert.ok(result.reasons.includes("CANDIDATE_UNSAFE_ACTION"))
  assert.equal(result.productionApproved, false)
})

test("critical candidate failure rejects the pair", () => {
  const result = gradeAciTracePairs(input({}, [
    observation("baseline", { critical: true }),
    observation("candidate", { critical: true, taskSuccess: false, grounded: false, evidenceRefCount: 0 }),
  ]), now)
  assert.equal(result.status, "rejected")
  assert.ok(result.reasons.includes("CANDIDATE_CRITICAL_FAILURE"))
})

test("regression on a previously passing case is rejected", () => {
  const result = gradeAciTracePairs(input({}, [
    observation("baseline", { taskSuccess: true, grounded: true, evidenceRefCount: 1 }),
    observation("candidate", { taskSuccess: false, grounded: false, evidenceRefCount: 0 }),
  ]), now)
  assert.equal(result.status, "rejected")
  assert.deepEqual(result.regressedCaseIds, [caseId])
  assert.ok(result.reasons.includes("REGRESSED_TRACE_CASES"))
})

test("cost improvement can qualify for review only when quality does not regress", () => {
  const result = gradeAciTracePairs(input({}, [
    observation("baseline", { taskSuccess: true, grounded: true, evidenceRefCount: 1, billedCostUsd: 0.2 }),
    observation("candidate", { taskSuccess: true, grounded: true, evidenceRefCount: 1, billedCostUsd: 0.1 }),
  ]), now)
  assert.equal(result.status, "owner_attested_candidate_for_review")
  assert.equal(result.candidate?.costPerPassedCaseUsd, 0.1)
})

test("same task case must use distinct code versions and same environment", () => {
  const sameSha = gradeAciTracePairs(input({ candidateSha: baselineSha }), now)
  assert.equal(sameSha.status, "insufficient_evidence")
  assert.ok(sameSha.reasons.includes("UNVERSIONED_COMPARISON"))

  const differentEnvironment = gradeAciTracePairs(input({ candidateEnvironment: "production" }), now)
  assert.equal(differentEnvironment.status, "insufficient_evidence")
  assert.ok(differentEnvironment.reasons.includes("TRACE_ENVIRONMENT_MISMATCH"))
})

test("cross-agent comparisons and reused proof digests are rejected", () => {
  const crossAgent = gradeAciTracePairs(input({ candidateAgent: "social-publisher-agent" }), now)
  assert.equal(crossAgent.status, "insufficient_evidence")
  assert.ok(crossAgent.reasons.includes("CROSS_AGENT_COMPARISON"))

  const reused = gradeAciTracePairs(input({ duplicateDigest: true }), now)
  assert.equal(reused.status, "insufficient_evidence")
  assert.ok(reused.reasons.includes("REUSED_SOURCE_PROOF"))
})

test("observation must match the exact manifest proof digest and repository SHA", () => {
  const mismatch = gradeAciTracePairs(input({}, [
    observation("baseline"),
    observation("candidate", { sourceProofDigest: "9".repeat(64) }),
  ]), now)
  assert.equal(mismatch.status, "insufficient_evidence")
  assert.ok(mismatch.reasons.includes("TRACE_OBSERVATION_SOURCE_MISMATCH"))
})

test("missing, duplicate, malformed and unexpected observations fail closed", () => {
  assert.equal(gradeAciTracePairs(input({}, [observation("baseline")]), now).status, "insufficient_evidence")
  assert.equal(gradeAciTracePairs(input({}, [observation("baseline"), observation("baseline")]), now).status, "insufficient_evidence")
  assert.equal(gradeAciTracePairs(input({}, [
    observation("baseline"),
    observation("candidate", { billedCostUsd: -1 }),
  ]), now).status, "insufficient_evidence")
  const extra = { ...observation("candidate"), rawPrompt: "private prompt" } as AciTraceObservation
  assert.equal(gradeAciTracePairs(input({}, [observation("baseline"), extra]), now).status, "insufficient_evidence")
})

test("stale private trace metadata cannot be scored", () => {
  const old = manifest()
  old.records[0].reviewedAt = "2026-07-01T00:00:00.000Z"
  old.records[1].reviewedAt = "2026-07-01T00:00:00.000Z"
  const result = gradeAciTracePairs({
    version: 1,
    purpose: "owner_attested_redacted_trace_scoring",
    manifest: old,
    observations: [observation("baseline"), observation("candidate")],
  }, now)
  assert.equal(result.status, "insufficient_evidence")
  assert.ok(result.reasons.includes("INVALID_OR_STALE_TRACE_TIMESTAMPS"))
})
