import { agents } from "../../app/agents/agentCatalog"
import {
  assessPublicResearchCandidate,
  type AciResearchCandidateInput,
  type AciResearchRecord,
  type AciSourceKind,
} from "./research-evidence"
import {
  evaluateAciImprovement,
  type AciEvaluationResult,
  type AciEvaluationStudy,
} from "./evaluation"

// Pure, offline reference selection only. No persistence, model access, network,
// tenant data, execution, tool permissions, or live-agent imports are introduced.
const AGENT_SLUGS = new Set(agents.map((agent) => agent.slug))
const SHA40 = /^[a-f0-9]{40}$/
const RECORD_FIELDS = [
  "fingerprint", "status", "verified", "trustedInstructions", "mayExecute",
  "dataClassification", "affectedAgentId", "baselineRepoSha", "claim",
  "source", "corroborationUrls",
] as const
const SOURCE_FIELDS = [
  "kind", "url", "title", "publisher", "retrievedAt", "publishedAt",
] as const
const REQUEST_FIELDS = ["agentSlug", "sourceRepoSha", "records", "maxReferences"] as const
const MAX_INPUT_RECORDS = 20
const MAX_REFERENCES = 5

export type AciReference = {
  fingerprint: string
  sourceUrl: string
  sourceKind: AciSourceKind
  retrievedAt: string
  corroborationUrls: string[]
  agentSlug: string
  sourceRepoSha: string
  dataOnly: true
  verified: false
  trustedInstructions: false
  mayExecute: false
}

export type AciReferenceRequest = {
  agentSlug: string
  sourceRepoSha: string
  records: unknown[]
  maxReferences?: number
}

export type AciReferenceSelection = {
  status: "research_only" | "blocked"
  references: AciReference[]
  evidenceVerified: false
  trustedInstructions: false
  mayExecute: false
  productionApproved: false
  reasons: string[]
}

export type AciReviewPlan = {
  status: "synthetic_candidate_for_human_review" | "blocked"
  sourceFingerprints: string[]
  syntheticEvaluationStatus: AciEvaluationResult["status"]
  evidenceMode: "synthetic_fixture_only"
  sourceVerificationComplete: false
  livePerformanceVerified: false
  approvedToExecute: false
  approvedToMerge: false
  approvedToDeploy: false
  approvedToPublish: false
  reasons: string[]
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function exactFields(value: Record<string, unknown>, fields: readonly string[], optional: readonly string[] = []): boolean {
  const present = Object.keys(value)
  return fields.every((field) => optional.includes(field) || Object.hasOwn(value, field)) &&
    present.every((key) => fields.includes(key))
}

// Validates the original record rather than trusting a claimed "verified" flag.
// An exact source link and a corroboration URL remain UNVERIFIED assertions.
function validatedResearch(value: unknown, now: Date): AciResearchRecord | null {
  if (!record(value) || !exactFields(value, RECORD_FIELDS)) return null
  if (
    value.status !== "research_only" ||
    value.dataClassification !== "public" ||
    value.verified !== false ||
    value.trustedInstructions !== false ||
    value.mayExecute !== false ||
    typeof value.fingerprint !== "string"
  ) return null
  if (!record(value.source) || !exactFields(value.source, SOURCE_FIELDS, ["publishedAt"])) return null
  if (!Array.isArray(value.corroborationUrls) ||
    !value.corroborationUrls.every((url) => typeof url === "string")) return null

  const source = value.source
  if (
    typeof value.affectedAgentId !== "string" ||
    typeof value.baselineRepoSha !== "string" ||
    typeof value.claim !== "string" ||
    typeof source.kind !== "string" ||
    typeof source.url !== "string" ||
    typeof source.title !== "string" ||
    typeof source.publisher !== "string" ||
    typeof source.retrievedAt !== "string" ||
    (source.publishedAt !== undefined && typeof source.publishedAt !== "string")
  ) return null

  const input: AciResearchCandidateInput = {
    dataClassification: "public",
    affectedAgentId: value.affectedAgentId,
    baselineRepoSha: value.baselineRepoSha,
    claim: value.claim,
    source: {
      kind: source.kind as AciSourceKind,
      url: source.url,
      title: source.title,
      publisher: source.publisher,
      retrievedAt: source.retrievedAt,
      ...(source.publishedAt === undefined ? {} : { publishedAt: source.publishedAt }),
    },
    corroborationUrls: value.corroborationUrls as string[],
  }
  const assessed = assessPublicResearchCandidate(input, now)
  if (!assessed.accepted) return null

  // Reject tampered fingerprint, tracking-URL aliases, unnormalized text and links;
  // only records produced by the existing normalizer can cross this boundary.
  if (
    assessed.record.fingerprint !== value.fingerprint ||
    assessed.record.claim !== value.claim ||
    JSON.stringify(assessed.record.source) !== JSON.stringify(source) ||
    JSON.stringify(assessed.record.corroborationUrls) !== JSON.stringify(value.corroborationUrls)
  ) return null
  return assessed.record
}

function blocked(reason: string): AciReferenceSelection {
  return {
    status: "blocked",
    references: [],
    evidenceVerified: false,
    trustedInstructions: false,
    mayExecute: false,
    productionApproved: false,
    reasons: [reason],
  }
}

// Produces ONLY source-reference metadata for human research review; not source claims,
// instructions, model context, a verified-knowledge store, or proof of task success.
export function selectAciResearchReferences(
  request: unknown,
  now: Date = new Date(),
): AciReferenceSelection {
  if (!record(request) || !exactFields(request, REQUEST_FIELDS, ["maxReferences"])) {
    return blocked("INVALID_REFERENCE_REQUEST")
  }
  if (typeof request.agentSlug !== "string" || !AGENT_SLUGS.has(request.agentSlug)) {
    return blocked("UNKNOWN_AGENT")
  }
  if (typeof request.sourceRepoSha !== "string" || !SHA40.test(request.sourceRepoSha)) {
    return blocked("INVALID_REPO_SHA")
  }
  const limit = request.maxReferences === undefined ? 3 : request.maxReferences
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > MAX_REFERENCES) {
    return blocked("INVALID_REFERENCE_LIMIT")
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    return blocked("INVALID_REVIEW_CLOCK")
  }
  if (!Array.isArray(request.records) || request.records.length > MAX_INPUT_RECORDS) {
    return blocked("INVALID_REFERENCE_COLLECTION")
  }
  if (request.records.length === 0) return blocked("NO_RESEARCH_RECORDS")

  const cleaned: AciResearchRecord[] = []
  for (const entry of request.records) {
    const candidate = validatedResearch(entry, now)
    if (!candidate) return blocked("UNVERIFIED_OR_TAMPERED_RESEARCH")
    if (candidate.affectedAgentId !== request.agentSlug ||
      candidate.baselineRepoSha !== request.sourceRepoSha) {
      return blocked("CROSS_AGENT_OR_VERSION_LEAK")
    }
    // Do not surface signed URLs, accidental secrets or session tokens in
    // references; a public classification alone is not proof that a URL is safe.
    const sourceQuery = new URL(candidate.source.url).searchParams
    if ([...sourceQuery.keys()].some((key) =>
      /^(?:token|access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret|secret|password|passwd|session|cookie|auth|authorization|signature|sig|otp|x-amz-.+|x-goog-.+)$/i.test(key),
    )) return blocked("SENSITIVE_SOURCE_URL")
    cleaned.push(candidate)
  }

  const unique = [...new Map(cleaned.map((item) => [item.fingerprint, item])).values()]
  unique.sort((a, b) =>
    b.source.retrievedAt.localeCompare(a.source.retrievedAt) ||
    a.fingerprint.localeCompare(b.fingerprint),
  )
  const references: AciReference[] = unique.slice(0, limit).map((item) => ({
    fingerprint: item.fingerprint,
    sourceUrl: item.source.url,
    sourceKind: item.source.kind,
    retrievedAt: item.source.retrievedAt,
    corroborationUrls: [...item.corroborationUrls],
    agentSlug: item.affectedAgentId,
    sourceRepoSha: item.baselineRepoSha,
    dataOnly: true,
    verified: false,
    trustedInstructions: false,
    mayExecute: false,
  }))
  return {
    status: "research_only",
    references,
    evidenceVerified: false,
    trustedInstructions: false,
    mayExecute: false,
    productionApproved: false,
    reasons: [],
  }
}

// Links unverified public research to an OFFLINE, synthetic evaluation result.
// Even a candidate_for_review is NOT a verified improvement or a release approval.
export function planAciOfflineImprovement(
  research: unknown,
  study: unknown,
  now: Date = new Date(),
): AciReviewPlan {
  const selected = selectAciResearchReferences(research, now)
  const evaluation = evaluateAciImprovement(study as AciEvaluationStudy)
  const consistentVersion = record(research) && record(study) &&
    study.baselineRepoSha === research.sourceRepoSha
  const eligible =
    selected.status === "research_only" &&
    consistentVersion &&
    evaluation.status === "candidate_for_review" &&
    evaluation.evidenceMode === "synthetic_fixture_only" &&
    evaluation.productionApproved === false
  return {
    status: eligible ? "synthetic_candidate_for_human_review" : "blocked",
    sourceFingerprints: selected.references.map((item) => item.fingerprint),
    syntheticEvaluationStatus: evaluation.status,
    evidenceMode: "synthetic_fixture_only",
    sourceVerificationComplete: false,
    livePerformanceVerified: false,
    approvedToExecute: false,
    approvedToMerge: false,
    approvedToDeploy: false,
    approvedToPublish: false,
    reasons: [
      ...selected.reasons,
      ...(consistentVersion ? [] : ["EVALUATION_VERSION_MISMATCH"]),
      ...(evaluation.reasons.length ? evaluation.reasons : []),
      ...(eligible ? [] : ["NOT_READY_FOR_HUMAN_REVIEW"]),
    ],
  }
}
