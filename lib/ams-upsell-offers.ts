/**
 * AMS optional cross-sell offers. Draft sales catalog only: no charge, email,
 * automation enrollment, Stripe price, or change to existing agent entitlements.
 * Customer-facing panels must remain behind NEXT_PUBLIC_AMS_UPSELLS_ENABLED.
 */
export const AUDIT_IMPLEMENTATION_OFFERS = [
  {
    id: "audit-quick-fix",
    title: "Quick Fix",
    priceLabel: "From $149 · quoted separately",
    outcome: "Get one priority change implemented, not just recommended.",
    scope: "One agreed, bounded fix, such as a headline, CTA, or on-page metadata update.",
    maximumFixes: 1,
    requestOffer: "business-cleanup-plan",
  },
  {
    id: "audit-growth-sprint",
    title: "Growth Sprint",
    priceLabel: "From $499 · quoted separately",
    outcome: "Turn the audit into an actionable first round of improvements.",
    scope: "Up to three separately agreed fixes within a written scope of work.",
    maximumFixes: 3,
    requestOffer: "business-cleanup-plan",
  },
  {
    id: "audit-full-implementation",
    title: "Full Implementation",
    priceLabel: "From $999 · quoted separately",
    outcome: "Get coordinated help implementing the audit priorities.",
    scope: "Up to five agreed fixes within a written scope of work, with explicit platform access approvals.",
    maximumFixes: 5,
    requestOffer: "business-cleanup-plan",
  },
] as const

export type AuditImplementationId = (typeof AUDIT_IMPLEMENTATION_OFFERS)[number]["id"]

export function getAuditImplementationOffer(id: string) {
  return AUDIT_IMPLEMENTATION_OFFERS.find((offer) => offer.id === id)
}

type SuggestedAgentUpsell = {
  title: string
  description: string
  priceLabel: string
  href: string
  type: "quote" | "subscription"
}

/**
 * Each of these seven slugs has a Live, subscriber-included workflow in AMS.
 * Do not upsell a standalone run or promise auto-publishing: these actions are
 * already included or require independent authorization.
 */
export const VERIFIED_AGENT_UPSELLS: Record<string, SuggestedAgentUpsell> = {
  "content-agent": {
    title: "Turn drafts into a campaign",
    description: "Request a scoped Social Content Pack for approved, ready-to-review posts and CTAs.",
    priceLabel: "Quote after review",
    href: "/ethical-agent-farm/request?offer=social-content-pack",
    type: "quote",
  },
  "lead-magnet-agent": {
    title: "Improve the conversion path",
    description: "Request a tailored Business Cleanup Plan connecting the lead magnet to a clear next step.",
    priceLabel: "Quote after review",
    href: "/ethical-agent-farm/request?offer=business-cleanup-plan",
    type: "quote",
  },
  "email-campaign-agent": {
    title: "Get ongoing campaign support",
    description: "Request scoped recurring marketing help; email sending stays separate from draft generation.",
    priceLabel: "Plan comparison / quote",
    href: "/pricing#plans",
    type: "subscription",
  },
  "nurture-agent": {
    title: "Keep the follow-up system organized",
    description: "Compare ongoing AMS plans without enrolling contacts or activating unsolicited sends.",
    priceLabel: "From $29/month",
    href: "/pricing#plans",
    type: "subscription",
  },
  "outreach-agent": {
    title: "Clarify your sales funnel",
    description: "Request a Business Cleanup Plan for offer messaging and human-controlled next steps.",
    priceLabel: "Quote after review",
    href: "/ethical-agent-farm/request?offer=business-cleanup-plan",
    type: "quote",
  },
  "seo-agent": {
    title: "Review the page and public profile",
    description: "Request a scoped website and profile review based on real publicly checkable signals.",
    priceLabel: "Quote after review",
    href: "/ethical-agent-farm/request?offer=website-profile-review",
    type: "quote",
  },
  "product-creator-agent": {
    title: "Get launch messaging support",
    description: "Request help clarifying the offer and first launch steps; no store publishing is included automatically.",
    priceLabel: "Quote after review",
    href: "/ethical-agent-farm/request?offer=business-cleanup-plan",
    type: "quote",
  },
}

export const SUBSCRIPTION_EXPANSION = [
  {
    id: "starter-to-growth",
    from: "starter",
    to: "growth",
    title: "Growth",
    priceLabel: "$79/month",
    criteria: "Only suggest when verified usage supports the larger shared credit pool.",
    href: "/pricing#plans",
  },
  {
    id: "growth-to-pro",
    from: "growth",
    to: "pro",
    title: "Pro",
    priceLabel: "$149/month",
    criteria: "Only suggest when actual usage exceeds Growth's effective monthly capacity.",
    href: "/pricing#plans",
  },
  {
    id: "subscriber-top-up",
    from: "subscriber",
    to: "topup",
    title: "Credit Top-Ups",
    priceLabel: "From $19, once",
    criteria: "Only for an eligible active subscriber needing more verified credits; web billing only.",
    href: "/billing",
  },
] as const

export function getVerifiedAgentUpsell(slug: string, status: string): SuggestedAgentUpsell | null {
  return status === "live" ? VERIFIED_AGENT_UPSELLS[slug] ?? null : null
}

/** Only predefined audit packages may prefill customer request notes. */
export function auditQuoteContext(id: string): string | null {
  const offer = getAuditImplementationOffer(id)
  if (!offer) return null
  return `I would like a quote for AMS ${offer.title} (${offer.priceLabel}).\nRequested scope: ${offer.scope}\nI understand pricing, timing, access, and deliverables require a separate written proposal and approval.\nMy business goals and the audit findings I want addressed:\n`
}

/** Deliberately off in all environments unless separately enabled. */
export function upsellsUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AMS_UPSELLS_ENABLED === "true"
}
