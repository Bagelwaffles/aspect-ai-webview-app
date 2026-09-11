import { agents, type Agent } from "@/app/agents/agentCatalog"
import {
  defineAgentContract,
  type AgentBillingMode,
  type AgentContract,
  type AgentDeliverableClass,
  type AgentPermission,
  type AgentRuntimeKind,
} from "@/lib/agent-contract"

const TEXT_NATIVE = new Set([
  "content-agent",
  "email-campaign-agent",
  "nurture-agent",
  "outreach-agent",
  "seo-agent",
])

const ACTION_NATIVE = new Set([
  "ams-fiverr-bridge",
  "aspect-overmind",
  "youtube-uploader-agent",
  "social-publisher-agent",
  "shopify-agent",
  "twitch-watcher-agent",
  "customer-support-agent",
  "technical-support-agent",
  "notifier-agent",
  "slack-agent",
  "telegram-agent",
  "sales-agent",
])

const SHARED_CONTENT_RUNTIME = new Set([
  "content-agent",
  "lead-magnet-agent",
  "email-campaign-agent",
  "nurture-agent",
  "outreach-agent",
  "seo-agent",
  "product-creator-agent",
])

const CONNECTIONS: Record<string, string[]> = {
  "youtube-uploader-agent": ["youtube"],
  "social-publisher-agent": ["linkedin", "facebook", "instagram", "youtube"],
  "shopify-agent": ["shopify"],
  "slack-agent": ["slack"],
  "analytics-agent": ["authorized-dataset"],
  "customer-support-agent": ["support-source", "knowledge-source"],
  "technical-support-agent": ["diagnostic-source"],
  "sales-agent": ["crm-or-approved-handoff"],
  "twitch-watcher-agent": ["twitch"],
  "telegram-agent": ["telegram"],
  "android-build-agent": ["google-play"],
}

function deliverableClass(agent: Agent): AgentDeliverableClass {
  if (TEXT_NATIVE.has(agent.slug)) return "text"
  if (ACTION_NATIVE.has(agent.slug)) return "action"
  return "artifact"
}

function runtimeKind(agent: Agent): AgentRuntimeKind {
  if (agent.slug === "aspect-overmind") return "internal-control-plane"
  if (SHARED_CONTENT_RUNTIME.has(agent.slug)) return "shared-content-runtime"
  if (ACTION_NATIVE.has(agent.slug)) return "connected-tool"
  if (agent.slug === "marketing-audit-agent") return "native-workflow"
  return "unconfigured"
}

function billingMode(agent: Agent): AgentBillingMode {
  if (agent.internal) return "internal"
  if (agent.slug === "marketing-audit-agent") return "one-time-checkout"
  if (SHARED_CONTENT_RUNTIME.has(agent.slug)) return "shared-generation-credit"
  return "unconfigured"
}

function permissionsFor(agent: Agent, klass: AgentDeliverableClass): AgentPermission[] {
  const permissions: AgentPermission[] = [
    {
      id: "workspace.read",
      mode: "read",
      approval: "none",
      reversible: true,
      purpose: "Read tenant-scoped customer context explicitly available to the agent.",
    },
  ]

  if (["Research", "Marketing", "Sales"].includes(agent.category)) {
    permissions.push({
      id: "public-web.read",
      mode: "read",
      approval: "none",
      reversible: true,
      purpose: "Read permitted public sources when live research is explicitly enabled for the run.",
    })
  }

  if (klass === "text" || klass === "artifact") {
    permissions.push({
      id: "deliverable.draft",
      mode: "draft",
      approval: "none",
      reversible: true,
      purpose: "Create a private customer-visible draft or artifact without external publication.",
    })
  }

  if (klass === "action") {
    permissions.push({
      id: agent.slug === "aspect-overmind" ? "agent.dispatch" : "external.action",
      mode: "write",
      approval: agent.slug === "aspect-overmind" ? "owner" : "human",
      reversible: false,
      purpose:
        agent.slug === "aspect-overmind"
          ? "Route an approved task to a registered AMS executor."
          : "Perform one explicitly approved external action through an authorized connection.",
    })
  }

  return permissions
}

export function contractForAgent(agent: Agent): AgentContract {
  const klass = deliverableClass(agent)
  const approval =
    agent.slug === "aspect-overmind"
      ? "owner-only"
      : klass === "action"
        ? "required-before-external-action"
        : "review-before-use"

  const contextSources: AgentContract["contextSources"] = ["customer-input", "workspace-profile"]
  if (klass === "artifact") contextSources.push("customer-assets")
  if ((CONNECTIONS[agent.slug] ?? []).length > 0) contextSources.push("connected-account")
  if (["Research", "Marketing", "Sales"].includes(agent.category)) contextSources.push("public-web")

  return defineAgentContract({
    slug: agent.slug,
    name: agent.name,
    category: agent.category,
    status: agent.status,
    capabilities: [...agent.capabilities],
    deliverableClass: klass,
    runtime: runtimeKind(agent),
    billing: billingMode(agent),
    approval,
    contextSources: [...new Set(contextSources)],
    permissions: permissionsFor(agent, klass),
    requiredConnections: CONNECTIONS[agent.slug] ?? [],
    liveProof: {
      verified: agent.status === "live",
      evidence: agent.statusReason,
      nextMilestone: agent.nextMilestone,
    },
  })
}

const REGISTRY = agents.map(contractForAgent)

export function listAgentContracts(): AgentContract[] {
  return REGISTRY.map((contract) => ({
    ...contract,
    capabilities: [...contract.capabilities],
    contextSources: [...contract.contextSources],
    permissions: contract.permissions.map((permission) => ({ ...permission })),
    requiredConnections: [...contract.requiredConnections],
    controlLimits: { ...contract.controlLimits },
    liveProof: { ...contract.liveProof },
  }))
}

export function getAgentContract(slug: string): AgentContract | null {
  return listAgentContracts().find((contract) => contract.slug === slug) ?? null
}
