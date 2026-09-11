import { randomUUID } from "node:crypto"

import { z } from "zod"

import { getAgentContract, listAgentContracts } from "@/lib/agent-contract-registry"
import type { AgentContract } from "@/lib/agent-contract"

export const overmindPlanInputSchema = z
  .object({
    objective: z.string().trim().min(10).max(2_000),
    requestedAgentSlugs: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
  })
  .strict()

export type OvermindPlanInput = z.infer<typeof overmindPlanInputSchema>

export type OvermindPlanStep = {
  order: number
  agentSlug: string
  agentName: string
  status: AgentContract["status"]
  deliverableClass: AgentContract["deliverableClass"]
  readiness: "ready-for-planning" | "approval-required" | "blocked"
  approval: AgentContract["approval"]
  requiredConnections: string[]
  reason: string
}

export type OvermindPlan = {
  id: string
  createdAt: string
  objective: string
  mode: "planning-only"
  executionPerformed: false
  ownerApprovalRequired: boolean
  steps: OvermindPlanStep[]
  blockers: string[]
  notes: string[]
}

export function overmindControlState(env: NodeJS.ProcessEnv = process.env) {
  return {
    planningEnabled: true,
    executionEnabled: false,
    killSwitchActive: env.AMS_OVERMIND_KILL_SWITCH?.trim().toLowerCase() === "true",
    reason:
      "Overmind v1 is planning-only. No generic executor adapter is registered, so it cannot silently publish, message, bill, delete, or mutate external systems.",
  } as const
}

function objectiveTokens(value: string) {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3),
  )
}

function objectiveRequiresLiveOnly(value: string) {
  const normalized = value.toLowerCase().replace(/\s+/gu, " ").trim()
  return (
    /\bonly\s+(?:currently\s+)?live(?:\s+ams)?\s+agents?\b/u.test(normalized) ||
    /\b(?:use|using)\s+only\s+(?:currently\s+)?live\b/u.test(normalized)
  )
}

function contractScore(contract: AgentContract, tokens: Set<string>) {
  const haystack = [contract.slug, contract.name, contract.category, ...contract.capabilities]
    .join(" ")
    .toLowerCase()
  let score = 0
  for (const token of tokens) {
    if (haystack.includes(token)) score += 1
  }
  return score
}

function resolveRequestedContracts(input: OvermindPlanInput) {
  return (input.requestedAgentSlugs ?? [])
    .map((slug) => getAgentContract(slug))
    .filter(Boolean) as AgentContract[]
}

function candidateContracts(input: OvermindPlanInput) {
  const liveOnly = objectiveRequiresLiveOnly(input.objective)

  if (input.requestedAgentSlugs?.length) {
    const resolved = resolveRequestedContracts(input)
    return liveOnly ? resolved.filter((contract) => contract.status === "live") : resolved
  }

  const tokens = objectiveTokens(input.objective)
  return listAgentContracts()
    .filter((contract) => contract.slug !== "aspect-overmind")
    .filter((contract) => !liveOnly || contract.status === "live")
    .map((contract) => ({ contract, score: contractScore(contract, tokens) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      if (left.contract.status === "live" && right.contract.status !== "live") return -1
      if (right.contract.status === "live" && left.contract.status !== "live") return 1
      return left.contract.name.localeCompare(right.contract.name)
    })
    .slice(0, 4)
    .map((entry) => entry.contract)
}

function stepFor(contract: AgentContract, order: number): OvermindPlanStep {
  if (contract.status !== "live") {
    return {
      order,
      agentSlug: contract.slug,
      agentName: contract.name,
      status: contract.status,
      deliverableClass: contract.deliverableClass,
      readiness: "blocked",
      approval: contract.approval,
      requiredConnections: [...contract.requiredConnections],
      reason: `Agent is ${contract.status}; ${contract.liveProof.nextMilestone}`,
    }
  }

  if (contract.deliverableClass === "action") {
    return {
      order,
      agentSlug: contract.slug,
      agentName: contract.name,
      status: contract.status,
      deliverableClass: contract.deliverableClass,
      readiness: "approval-required",
      approval: contract.approval,
      requiredConnections: [...contract.requiredConnections],
      reason: "Live action-native work still requires the contract's explicit human or owner approval gate.",
    }
  }

  return {
    order,
    agentSlug: contract.slug,
    agentName: contract.name,
    status: contract.status,
    deliverableClass: contract.deliverableClass,
    readiness: "ready-for-planning",
    approval: contract.approval,
    requiredConnections: [...contract.requiredConnections],
    reason: "Live agent has production proof and may be included in a plan; execution remains outside Overmind v1.",
  }
}

export function createOvermindPlan(
  rawInput: unknown,
  options: { id?: () => string; now?: () => Date } = {},
): OvermindPlan {
  const input = overmindPlanInputSchema.parse(rawInput)
  const liveOnly = objectiveRequiresLiveOnly(input.objective)
  const candidates = candidateContracts(input)
  const steps = candidates.map((contract, index) => stepFor(contract, index + 1))
  const blockers: string[] = []

  if (input.requestedAgentSlugs?.length) {
    const resolved = resolveRequestedContracts(input)
    if (resolved.length !== input.requestedAgentSlugs.length) {
      blockers.push("One or more requested agent slugs are not registered.")
    }
    if (liveOnly && resolved.some((contract) => contract.status !== "live")) {
      blockers.push(
        "One or more requested agents were excluded because the objective requires currently Live AMS agents.",
      )
    }
  }
  if (!steps.length) {
    blockers.push("No registered AMS agent matched the objective strongly enough for deterministic routing.")
  }
  for (const step of steps) {
    if (step.readiness === "blocked") blockers.push(`${step.agentName}: ${step.reason}`)
  }

  const notes = [
    "Overmind v1 never treats a plan as proof of execution.",
    "External publishing, messaging, billing, deletion, store changes, and other mutations remain approval-gated.",
    "Customer workspace, connected-account, file, and web context remain untrusted inputs to the model layer.",
  ]
  if (liveOnly) {
    notes.push("The objective's currently-Live-only constraint was applied before relevance ranking.")
  }

  return {
    id: (options.id ?? randomUUID)(),
    createdAt: (options.now ?? (() => new Date()))().toISOString(),
    objective: input.objective,
    mode: "planning-only",
    executionPerformed: false,
    ownerApprovalRequired: steps.some(
      (step) => step.approval === "owner-only" || step.readiness === "approval-required",
    ),
    steps,
    blockers: [...new Set(blockers)],
    notes,
  }
}
