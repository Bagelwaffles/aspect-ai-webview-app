import { agents } from "../../app/agents/agentCatalog"

// Metadata-only, offline intake. Do not place populated owner/customer traces in GitHub.
// Successful validation proves shape and owner-attestation fields only, NOT source authenticity.
type Stage = "baseline" | "candidate"
type Outcome = "completed" | "failed" | "blocked"
type ReviewerRole = "owner" | "authorized_reviewer"

export type AciPrivateTraceReference = {
  caseId: string
  agentSlug: string
  stage: Stage
  repoSha: string
  sourceEnvironment: "preview" | "production"
  sourceProofDigest: string
  observedAt: string
  reviewedAt: string
  reviewerRole: ReviewerRole
  outcome: Outcome
  attestations: {
    ownerAuthorized: true
    sourceReviewed: true
    personalAndCustomerDataExcluded: true
    secretsAndCredentialsExcluded: true
    rawPromptsAndOutputsExcluded: true
    sourceMappingRetainedPrivately: true
  }
}

export type AciPrivateTraceManifest = {
  version: 1
  purpose: "offline_private_evidence_review"
  records: AciPrivateTraceReference[]
}

export type AciPrivateTraceIntakeResult = {
  accepted: boolean
  status: "metadata_only_unverified"
  classification: "restricted_private_metadata"
  recordCount: number
  readyForScoring: false
  sourceAuthenticityVerified: false
  productionApproved: false
  reasons: string[]
}

const AGENT_SLUGS = new Set(agents.map(({ slug }) => slug))
const SHA40 = /^[a-f0-9]{40}$/
const DIGEST64 = /^[a-f0-9]{64}$/
const CASE_ID = /^[a-z0-9][a-z0-9-]{1,79}$/
const AGE_LIMIT_MS = 90 * 24 * 60 * 60 * 1000
const CLOCK_SKEW_MS = 5 * 60 * 1000
const TOP_FIELDS = ["version", "purpose", "records"]
const RECORD_FIELDS = [
  "caseId", "agentSlug", "stage", "repoSha", "sourceEnvironment",
  "sourceProofDigest", "observedAt", "reviewedAt", "reviewerRole",
  "outcome", "attestations",
]
const ATTESTATION_FIELDS = [
  "ownerAuthorized", "sourceReviewed", "personalAndCustomerDataExcluded",
  "secretsAndCredentialsExcluded", "rawPromptsAndOutputsExcluded",
  "sourceMappingRetainedPrivately",
]

function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function exactFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === fields.length && keys.every((key) => fields.includes(key))
}

function timestamp(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null
  const ms = Date.parse(value)
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 19) !== value.slice(0, 19)) return null
  return ms
}

// This never reads or authenticates private traces, never calls a model, and never
// promotes a fixture into verified learning. External, private source proof remains required.
export function inspectAciPrivateTraceManifest(
  input: unknown,
  now: Date = new Date(),
): AciPrivateTraceIntakeResult {
  const reasons: string[] = []
  const rejected = (errors: string[]): AciPrivateTraceIntakeResult => ({
    accepted: false,
    status: "metadata_only_unverified",
    classification: "restricted_private_metadata",
    recordCount: 0,
    readyForScoring: false,
    sourceAuthenticityVerified: false,
    productionApproved: false,
    reasons: [...new Set(errors)],
  })

  if (!plainObject(input) || !exactFields(input, TOP_FIELDS)) return rejected(["INVALID_OR_UNEXPECTED_MANIFEST_FIELDS"])
  if (input.version !== 1 || input.purpose !== "offline_private_evidence_review") {
    reasons.push("INVALID_MANIFEST_VERSION_OR_PURPOSE")
  }
  if (!Array.isArray(input.records) || input.records.length < 2 || input.records.length > 40) {
    return rejected([...reasons, "INVALID_MANIFEST_RECORDS"])
  }
  const referenceProofs = new Set<string>()
  const byCase = new Map<string, Map<Stage, AciPrivateTraceReference>>()
  const time = now.getTime()
  if (!Number.isFinite(time)) reasons.push("INVALID_REVIEW_CLOCK")

  for (const value of input.records) {
    if (!plainObject(value) || !exactFields(value, RECORD_FIELDS)) {
      reasons.push("INVALID_OR_UNEXPECTED_RECORD_FIELDS")
      continue
    }
    const record = value as AciPrivateTraceReference
    if (typeof record.caseId !== "string" || !CASE_ID.test(record.caseId)) reasons.push("INVALID_CASE_ID")
    if (typeof record.agentSlug !== "string" || !AGENT_SLUGS.has(record.agentSlug)) reasons.push("UNKNOWN_AGENT")
    if (record.stage !== "baseline" && record.stage !== "candidate") reasons.push("INVALID_STAGE")
    if (typeof record.repoSha !== "string" || !SHA40.test(record.repoSha)) reasons.push("INVALID_REPO_SHA")
    if (record.sourceEnvironment !== "preview" && record.sourceEnvironment !== "production") reasons.push("INVALID_SOURCE_ENVIRONMENT")
    if (typeof record.sourceProofDigest !== "string" || !DIGEST64.test(record.sourceProofDigest)) {
      reasons.push("INVALID_SOURCE_PROOF_DIGEST")
    } else if (referenceProofs.has(record.sourceProofDigest)) {
      reasons.push("REUSED_SOURCE_PROOF")
    } else {
      referenceProofs.add(record.sourceProofDigest)
    }
    const observedAt = timestamp(record.observedAt)
    const reviewedAt = timestamp(record.reviewedAt)
    if (observedAt === null || reviewedAt === null ||
      observedAt > reviewedAt || observedAt > time + CLOCK_SKEW_MS ||
      reviewedAt > time + CLOCK_SKEW_MS || reviewedAt < time - AGE_LIMIT_MS) {
      reasons.push("INVALID_OR_STALE_TRACE_TIMESTAMPS")
    }
    if (record.reviewerRole !== "owner" && record.reviewerRole !== "authorized_reviewer") reasons.push("INVALID_REVIEW_ROLE")
    if (!["completed", "failed", "blocked"].includes(record.outcome)) reasons.push("INVALID_OUTCOME")
    const attestations: unknown = record.attestations
    if (!plainObject(attestations) ||
      !exactFields(attestations, ATTESTATION_FIELDS) ||
      ATTESTATION_FIELDS.some((field) => attestations[field] !== true)) {
      reasons.push("MISSING_PRIVACY_OR_AUTHORIZATION_ATTESTATION")
    }

    if (typeof record.caseId === "string" && CASE_ID.test(record.caseId) &&
        (record.stage === "baseline" || record.stage === "candidate")) {
      const stages = byCase.get(record.caseId) ?? new Map<Stage, AciPrivateTraceReference>()
      if (stages.has(record.stage)) reasons.push("DUPLICATE_CASE_STAGE")
      else stages.set(record.stage, record)
      byCase.set(record.caseId, stages)
    }
  }

  for (const stages of byCase.values()) {
    const baseline = stages.get("baseline")
    const candidate = stages.get("candidate")
    if (!baseline || !candidate) reasons.push("UNPAIRED_CASE")
    else {
      if (baseline.agentSlug !== candidate.agentSlug) reasons.push("CROSS_AGENT_COMPARISON")
      if (baseline.repoSha === candidate.repoSha) reasons.push("UNVERSIONED_COMPARISON")
    }
  }
  if (reasons.length > 0) return rejected(reasons)

  return {
    accepted: true,
    status: "metadata_only_unverified",
    classification: "restricted_private_metadata",
    recordCount: input.records.length,
    readyForScoring: false,
    sourceAuthenticityVerified: false,
    productionApproved: false,
    reasons: [],
  }
}
