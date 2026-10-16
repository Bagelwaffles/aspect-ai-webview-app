import { createHash, randomUUID } from "node:crypto"

export const AMS_ACTION_LIFECYCLE = [
  "event",
  "proposed_action",
  "approval",
  "execution",
  "audit_log",
] as const

export type AmsActionLifecycleStage = (typeof AMS_ACTION_LIFECYCLE)[number]

export type AmsGovernedActionKind =
  | "read"
  | "monitor"
  | "draft"
  | "recommend"
  | "private_artifact"
  | "reversible_mutation"
  | "publish"
  | "message"
  | "spend"
  | "billing_change"
  | "credential_change"
  | "permission_change"
  | "production_config"
  | "delete"
  | "destructive_mutation"

export type AmsApprovalRequirement = "none" | "human" | "owner"
export type AmsActionRisk = "green" | "yellow" | "red"

export type AmsGovernanceDecision = {
  actionKind: string
  risk: AmsActionRisk
  approval: AmsApprovalRequirement
  automaticExecutionAllowed: boolean
  failClosed: boolean
  reason: string
}

export type AmsGovernedActionIntent = {
  eventId: string
  actionKind: string
  provider: string
  target: string
  resourceScope: string
  summary: string
  idempotencyKey?: string
}

export type AmsGovernedActionProposal = AmsGovernedActionIntent & {
  id: string
  proposedAt: string
  risk: AmsActionRisk
  approvalRequired: AmsApprovalRequirement
  automaticExecutionAllowed: boolean
  failClosed: boolean
  actionFingerprint: string
}

export type AmsApprovalActorRole = "operator" | "owner"

const AUTO_ACTIONS = new Set<string>(["read", "monitor", "draft", "recommend", "private_artifact"])
const HUMAN_APPROVAL_ACTIONS = new Set<string>(["reversible_mutation", "publish", "message"])
const OWNER_APPROVAL_ACTIONS = new Set<string>([
  "spend",
  "billing_change",
  "credential_change",
  "permission_change",
  "production_config",
  "delete",
  "destructive_mutation",
])

export function governanceDecisionForAction(actionKind: string): AmsGovernanceDecision {
  const normalized = actionKind.trim().toLowerCase()

  if (AUTO_ACTIONS.has(normalized)) {
    return {
      actionKind: normalized,
      risk: "green",
      approval: "none",
      automaticExecutionAllowed: true,
      failClosed: false,
      reason: "Read-only, monitoring, drafting, recommendation, and private-artifact work may run without an external side effect.",
    }
  }

  if (HUMAN_APPROVAL_ACTIONS.has(normalized)) {
    return {
      actionKind: normalized,
      risk: "yellow",
      approval: "human",
      automaticExecutionAllowed: false,
      failClosed: false,
      reason: "The action changes an external system or communicates externally and requires explicit human approval.",
    }
  }

  if (OWNER_APPROVAL_ACTIONS.has(normalized)) {
    return {
      actionKind: normalized,
      risk: "red",
      approval: "owner",
      automaticExecutionAllowed: false,
      failClosed: false,
      reason: "Spending, billing, credential, permission, production configuration, deletion, and destructive actions require explicit owner approval.",
    }
  }

  return {
    actionKind: normalized || "unknown",
    risk: "red",
    approval: "owner",
    automaticExecutionAllowed: false,
    failClosed: true,
    reason: "Unknown action kinds fail closed and require owner review before any executor may run.",
  }
}

export function actionIntentFingerprint(intent: AmsGovernedActionIntent): string {
  const canonical = [
    intent.eventId.trim(),
    intent.actionKind.trim().toLowerCase(),
    intent.provider.trim().toLowerCase(),
    intent.target.trim(),
    intent.resourceScope.trim(),
    intent.summary.trim(),
    intent.idempotencyKey?.trim() ?? "",
  ]
  return createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex")
}

export function createGovernedActionProposal(
  intent: AmsGovernedActionIntent,
  options: { id?: () => string; now?: () => Date } = {},
): AmsGovernedActionProposal {
  const decision = governanceDecisionForAction(intent.actionKind)
  return {
    ...intent,
    actionKind: decision.actionKind,
    id: (options.id ?? randomUUID)(),
    proposedAt: (options.now ?? (() => new Date()))().toISOString(),
    risk: decision.risk,
    approvalRequired: decision.approval,
    automaticExecutionAllowed: decision.automaticExecutionAllowed,
    failClosed: decision.failClosed,
    actionFingerprint: actionIntentFingerprint({ ...intent, actionKind: decision.actionKind }),
  }
}

export function approvalSatisfiesGovernance(
  proposal: Pick<AmsGovernedActionProposal, "approvalRequired" | "automaticExecutionAllowed" | "failClosed">,
  actorRole?: AmsApprovalActorRole,
): boolean {
  if (proposal.failClosed) return false
  if (proposal.approvalRequired === "none") return proposal.automaticExecutionAllowed
  if (proposal.approvalRequired === "human") return actorRole === "operator" || actorRole === "owner"
  return actorRole === "owner"
}
