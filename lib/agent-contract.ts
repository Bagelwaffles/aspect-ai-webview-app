import type { AgentCategory, AgentStatus } from "@/app/agents/agentCatalog"

export const AGENT_TEMPLATE_VERSION = 1 as const

export type AgentDeliverableClass = "text" | "artifact" | "action"
export type AgentRuntimeKind =
  | "shared-content-runtime"
  | "native-workflow"
  | "connected-tool"
  | "internal-control-plane"
  | "unconfigured"
export type AgentBillingMode =
  | "shared-generation-credit"
  | "one-time-checkout"
  | "subscription"
  | "internal"
  | "unconfigured"
export type AgentApprovalMode =
  | "review-before-use"
  | "required-before-external-action"
  | "owner-only"
export type AgentPermissionMode = "read" | "draft" | "write" | "publish" | "billing"
export type AgentPermissionApproval = "none" | "human" | "owner"

export type AgentPermission = {
  id: string
  mode: AgentPermissionMode
  approval: AgentPermissionApproval
  reversible: boolean
  purpose: string
}

export type AgentControlLimits = {
  timeoutMs: number
  maxRetries: number
  maxToolCalls: number
  maxExternalMutations: number
  requiresIdempotencyKeyForMutations: boolean
}

export type AgentContract = {
  templateVersion: typeof AGENT_TEMPLATE_VERSION
  slug: string
  name: string
  category: AgentCategory
  status: AgentStatus
  capabilities: string[]
  deliverableClass: AgentDeliverableClass
  runtime: AgentRuntimeKind
  billing: AgentBillingMode
  approval: AgentApprovalMode
  contextSources: Array<
    "customer-input" | "workspace-profile" | "customer-assets" | "connected-account" | "public-web"
  >
  permissions: AgentPermission[]
  requiredConnections: string[]
  tenantIsolation: "stable-customer-subject"
  failClosed: true
  treatsExternalContextAsUntrusted: true
  recordsAuditState: true
  controlLimits: AgentControlLimits
  liveProof: {
    verified: boolean
    evidence: string
    nextMilestone: string
  }
}

export const DEFAULT_AGENT_CONTROL_LIMITS: AgentControlLimits = {
  timeoutMs: 120_000,
  maxRetries: 2,
  maxToolCalls: 12,
  maxExternalMutations: 1,
  requiresIdempotencyKeyForMutations: true,
}

export function assertAgentContract(contract: AgentContract): AgentContract {
  if (contract.templateVersion !== AGENT_TEMPLATE_VERSION) {
    throw new Error("AGENT_TEMPLATE_VERSION_UNSUPPORTED")
  }
  if (!contract.slug.trim() || !contract.name.trim()) {
    throw new Error("AGENT_IDENTITY_REQUIRED")
  }
  if (contract.deliverableClass === "action" && contract.approval === "review-before-use") {
    throw new Error("ACTION_AGENT_APPROVAL_REQUIRED")
  }
  if (contract.status === "live" && !contract.liveProof.verified) {
    throw new Error("LIVE_AGENT_PROOF_REQUIRED")
  }
  if (contract.status === "live" && !contract.liveProof.evidence.trim()) {
    throw new Error("LIVE_AGENT_EVIDENCE_REQUIRED")
  }

  for (const permission of contract.permissions) {
    if (["write", "publish", "billing"].includes(permission.mode) && permission.approval === "none") {
      throw new Error(`MUTATION_APPROVAL_REQUIRED:${permission.id}`)
    }
    if (permission.mode === "billing" && permission.approval !== "owner") {
      throw new Error(`BILLING_OWNER_APPROVAL_REQUIRED:${permission.id}`)
    }
  }

  if (
    contract.permissions.some((permission) => ["write", "publish", "billing"].includes(permission.mode)) &&
    !contract.controlLimits.requiresIdempotencyKeyForMutations
  ) {
    throw new Error("MUTATION_IDEMPOTENCY_REQUIRED")
  }

  return contract
}

export function defineAgentContract(
  input: Omit<
    AgentContract,
    | "templateVersion"
    | "tenantIsolation"
    | "failClosed"
    | "treatsExternalContextAsUntrusted"
    | "recordsAuditState"
    | "controlLimits"
  > & { controlLimits?: Partial<AgentControlLimits> },
): AgentContract {
  return assertAgentContract({
    ...input,
    templateVersion: AGENT_TEMPLATE_VERSION,
    tenantIsolation: "stable-customer-subject",
    failClosed: true,
    treatsExternalContextAsUntrusted: true,
    recordsAuditState: true,
    controlLimits: { ...DEFAULT_AGENT_CONTROL_LIMITS, ...(input.controlLimits ?? {}) },
  })
}
