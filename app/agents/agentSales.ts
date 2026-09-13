import { SUBSCRIPTION_INCLUDED_AGENTS } from "@/lib/subscription-agent-catalog"

import type { Agent } from "./agentCatalog"

export type AgentSalesMode = "subscription" | "one-time" | "beta" | "roadmap"

export type AgentSalesOffer = {
  mode: AgentSalesMode
  label: string
  price: string
  detail: string
  primaryLabel: string
  primaryHref: string
  secondaryLabel?: string
  secondaryHref?: string
  videoEmbedUrl: string
  videoTitle: string
}

export const AMS_AGENT_SALES_VIDEO_ID = "f1cd50c072c34d37ab911a1c4895ce4a"
export const AMS_AGENT_SALES_VIDEO_EMBED_URL = `https://app.heygen.com/embeds/${AMS_AGENT_SALES_VIDEO_ID}`

const subscriptionSlugs = new Set(SUBSCRIPTION_INCLUDED_AGENTS.map((agent) => agent.slug))

export function isSubscriptionAgent(agent: Agent) {
  return subscriptionSlugs.has(agent.slug as (typeof SUBSCRIPTION_INCLUDED_AGENTS)[number]["slug"])
}

export function getAgentSalesOffer(agent: Agent): AgentSalesOffer {
  const video = {
    videoEmbedUrl: AMS_AGENT_SALES_VIDEO_EMBED_URL,
    videoTitle: `${agent.name} sales overview`,
  }

  if (isSubscriptionAgent(agent)) {
    return {
      mode: "subscription",
      label: "Available now",
      price: "From $29/month",
      detail: "Included in every AMS shared-credit subscription plan. One completed generation uses one shared plan credit.",
      primaryLabel: "Choose an AMS plan",
      primaryHref: "/pricing#plans",
      secondaryLabel: "Open this agent",
      secondaryHref: agent.launchHref,
      ...video,
    }
  }

  if (agent.slug === "marketing-audit-agent") {
    return {
      mode: "one-time",
      label: "Public paid service",
      price: "$49 one-time",
      detail: "Buy the existing Quick Marketing Audit through the verified AMS Stripe checkout and native fulfillment path.",
      primaryLabel: "Buy the $49 audit",
      primaryHref: "/quick-marketing-audit",
      secondaryLabel: "See all pricing",
      secondaryHref: "/pricing",
      ...video,
    }
  }

  if (agent.status === "beta" && agent.launchHref && !agent.internal) {
    return {
      mode: "beta",
      label: "Controlled beta",
      price: "Not sold as a standalone product",
      detail: "This agent has a controlled product surface, but AMS has not promoted it to a generally available paid agent yet.",
      primaryLabel: "Explore the beta",
      primaryHref: agent.launchHref,
      secondaryLabel: "See available plans",
      secondaryHref: "/pricing",
      ...video,
    }
  }

  return {
    mode: "roadmap",
    label: agent.status === "blocked" ? "Blocked / roadmap" : "Roadmap agent",
    price: "Not for sale yet",
    detail: "This capability remains visible so buyers can understand the AMS roadmap without mistaking unfinished work for a working product.",
    primaryLabel: "See available agents",
    primaryHref: "/agents?status=live#catalog",
    secondaryLabel: "Review launch status",
    secondaryHref: "/contact",
    ...video,
  }
}

export function getCategoryOutcome(category: Agent["category"]) {
  switch (category) {
    case "Marketing":
      return "Turn marketing work into a repeatable, human-reviewed workflow instead of rebuilding the same campaign assets from scratch."
    case "Sales":
      return "Move from raw prospect context to a clearer next sales action while keeping customer-facing outreach under human control."
    case "Automation":
      return "Reduce repetitive handoffs with scoped workflows that keep triggers, integrations, approvals, and failures visible."
    case "Content":
      return "Create usable business content faster while keeping the final message, brand voice, and publishing decision in your hands."
    case "Commerce":
      return "Package products and commerce work into structured drafts and workflows without pretending AMS can publish or sell before authorization."
    case "Operations":
      return "Give operators a clearer view of business activity, evidence, support work, and next actions without hiding the controls."
    case "Research":
      return "Turn permitted source material into structured research inputs and briefs that can support better business decisions."
    case "Creator":
      return "Move creator work from idea to a more organized production handoff while retaining channel and publishing control."
    case "Platform":
      return "Coordinate the systems behind AMS with explicit authorization, auditability, and bounded execution instead of a black-box automation layer."
  }
}
