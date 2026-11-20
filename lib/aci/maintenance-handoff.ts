import {
  selectAciResearchReferences,
  type AciReferenceRequest,
} from "./research-review"

// This module prepares only the owner's existing PR #280 maintenance action.
// No imports from the unmerged maintenance PR, no fetch, no Redis and no
// credentials: a separate authenticated owner client must explicitly submit.
const MAINTENANCE_FRESHNESS_MS = 48 * 60 * 60 * 1000
const FUTURE_SKEW_MS = 5 * 60 * 1000

export type AciMaintenanceResearchRequest = {
  action: "record_research"
  area: string
  summary: string
  sourceFingerprint: string
  sourceObservedAt: string
  evidenceUrl: string
  businessImpact: string
}

export type AciMaintenanceHandoff = {
  status: "owner_submission_required" | "blocked"
  requests: AciMaintenanceResearchRequest[]
  endpoint: "/api/internal/maintenance"
  environment: "preview_only"
  sourceVerified: false
  submitted: false
  redisWritten: false
  executionPerformed: false
  productionAuthorized: false
  reasons: string[]
}

function blocked(reasons: string[]): AciMaintenanceHandoff {
  return {
    status: "blocked",
    requests: [],
    endpoint: "/api/internal/maintenance",
    environment: "preview_only",
    sourceVerified: false,
    submitted: false,
    redisWritten: false,
    executionPerformed: false,
    productionAuthorized: false,
    reasons: [...new Set(reasons)],
  }
}

// Bridges the separate ACI reference window (30d) to PR #280's *48-hour*
// monitored-finding freshness rule, without relaxing either policy.
// Only fixed template text crosses the boundary, not untrusted video claims.
export function prepareAciMaintenanceResearchHandoff(
  request: AciReferenceRequest | unknown,
  now: Date = new Date(),
): AciMaintenanceHandoff {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    return blocked(["INVALID_REVIEW_CLOCK"])
  }
  const refs = selectAciResearchReferences(request, now)
  if (refs.status !== "research_only") return blocked(refs.reasons)
  const actions: AciMaintenanceResearchRequest[] = []
  for (const ref of refs.references) {
    const observed = Date.parse(ref.retrievedAt)
    if (!Number.isFinite(observed) ||
      now.getTime() - observed > MAINTENANCE_FRESHNESS_MS ||
      observed > now.getTime() + FUTURE_SKEW_MS) {
      return blocked(["MAINTENANCE_SOURCE_STALE_OR_FUTURE"])
    }
    if (ref.sourceUrl.length > 800 || !/^[a-f0-9]{64}$/.test(ref.fingerprint)) {
      return blocked(["MAINTENANCE_SOURCE_INVALID"])
    }
    actions.push({
      action: "record_research",
      area: "aci-research",
      summary: "Public research reference for AMS agent " + ref.agentSlug +
        "; independently verify before proposing any change.",
      sourceFingerprint: "aci:" + ref.fingerprint,
      sourceObservedAt: ref.retrievedAt,
      evidenceUrl: ref.sourceUrl,
      businessImpact: "Research only. No cost, code, customer, tool, or publication action authorized.",
    })
  }
  if (!actions.length) return blocked(["NO_RESEARCH_RECORDS"])
  return {
    status: "owner_submission_required",
    requests: actions,
    endpoint: "/api/internal/maintenance",
    environment: "preview_only",
    sourceVerified: false,
    submitted: false,
    redisWritten: false,
    executionPerformed: false,
    productionAuthorized: false,
    reasons: [],
  }
}
