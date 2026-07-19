export type EthicalAgentRole = {
  id: string
  name: string
  summary: string
  responsibilities: string[]
  guardrails: string[]
}

export type EthicalOffer = {
  id: string
  name: string
  price: string
  billingLabel: string
  summary: string
  deliverables: string[]
  cta: string
  ctaHref: string
  featured?: boolean
}

export const ETHICAL_AGENT_ROLES: EthicalAgentRole[] = [
  {
    id: "overmind-ceo",
    name: "Overmind CEO Agent",
    summary: "Sets priorities, coordinates the system, and keeps the team focused on revenue-producing work.",
    responsibilities: ["Choose the daily objective", "Route work to the right agent", "Review compliance blockers", "Track performance"],
    guardrails: ["No autonomous outreach", "No fake urgency", "Human approval before launch"],
  },
  {
    id: "offer-agent",
    name: "Offer Agent",
    summary: "Turns capabilities into simple, easy-to-buy offers.",
    responsibilities: ["Package services", "Price offers clearly", "Keep the menu small and understandable", "Align deliverables to buyer intent"],
    guardrails: ["No inflated claims", "No hidden upsells", "No confusion in pricing"],
  },
  {
    id: "content-agent",
    name: "Content Agent",
    summary: "Drafts useful posts and content that help real businesses.",
    responsibilities: ["Write posts", "Repurpose offers", "Create social snippets", "Support the website"],
    guardrails: ["No spam", "No fake testimonials", "Human review required"],
  },
  {
    id: "lead-research-agent",
    name: "Lead Research Agent",
    summary: "Finds public businesses with obvious, visible problems that a useful audit can solve.",
    responsibilities: ["Spot public gaps", "Rank easy wins", "Collect public context only"],
    guardrails: ["No scraping private data", "No personal data enrichment", "Public sources only"],
  },
  {
    id: "outreach-drafting-agent",
    name: "Outreach Drafting Agent",
    summary: "Writes respectful, low-volume outreach drafts for human approval.",
    responsibilities: ["Draft emails", "Draft DMs", "Personalize by public context"],
    guardrails: ["No auto-send", "No mass DMs", "No pressure tactics"],
  },
  {
    id: "audit-delivery-agent",
    name: "Audit Delivery Agent",
    summary: "Creates quick, useful audits with fixes the prospect can act on immediately.",
    responsibilities: ["List 5 problems", "List 5 fixes", "Give one next step", "Show practical value"],
    guardrails: ["No fake authority", "No misleading claims", "No padded fluff"],
  },
  {
    id: "affiliate-agent",
    name: "Affiliate Agent",
    summary: "Finds legitimate affiliate opportunities and keeps disclosure visible.",
    responsibilities: ["Suggest relevant tools", "Add disclosure copy", "Avoid sketchy offers"],
    guardrails: ["No undisclosed affiliate links", "No hidden sponsorships", "No hype traps"],
  },
  {
    id: "compliance-agent",
    name: "Compliance Agent",
    summary: "Checks every draft against platform, privacy, and disclosure rules.",
    responsibilities: ["Review risk", "Block unsafe drafts", "Approve safe drafts"],
    guardrails: ["Reject when uncertain", "Escalate to human", "Protect reputation"],
  },
  {
    id: "analytics-agent",
    name: "Analytics Agent",
    summary: "Tracks what gets sent, what gets approved, and what turns into revenue.",
    responsibilities: ["Log outcomes", "Measure replies", "Find winning offers", "Track daily revenue"],
    guardrails: ["No private data exposure", "No vanity metrics only", "Keep reporting honest"],
  },
]

export const ETHICAL_OFFERS: EthicalOffer[] = [
  {
    id: "quick-marketing-audit",
    name: "Quick Marketing Audit",
    price: "$49",
    billingLabel: "One-time",
    summary: "A fast, practical audit with the top issues and the first fixes that matter.",
    deliverables: ["5 problems", "5 fixes", "sample headline", "sample offer", "sample post"],
    cta: "Request audit",
    ctaHref: "/billing",
  },
  {
    id: "social-content-pack",
    name: "Social Content Pack",
    price: "$99",
    billingLabel: "One-time",
    summary: "Ready-to-use posts and hooks for a small business that needs consistent content.",
    deliverables: ["10 post ideas", "5 ready posts", "CTA set", "light brand angle"],
    cta: "Request content pack",
    ctaHref: "/billing",
  },
  {
    id: "website-profile-review",
    name: "Website / Google Profile Review",
    price: "$199",
    billingLabel: "One-time",
    summary: "A stronger review that focuses on conversion, clarity, and local trust signals.",
    deliverables: ["site critique", "Google profile notes", "conversion fixes", "priority checklist"],
    cta: "Request review",
    ctaHref: "/billing",
  },
  {
    id: "business-cleanup-plan",
    name: "Business Cleanup Plan",
    price: "$297",
    billingLabel: "One-time",
    summary: "A practical cleanup plan for businesses that need sharper positioning and a cleaner funnel.",
    deliverables: ["offer cleanup", "homepage fixes", "content priorities", "next 7-day plan"],
    cta: "Request cleanup plan",
    ctaHref: "/billing",
  },
  {
    id: "monthly-marketing-support",
    name: "Marketing Support",
    price: "$497",
    billingLabel: "Monthly",
    summary: "Ongoing support for content, audits, and lightweight marketing execution.",
    deliverables: ["monthly audit", "content support", "offer tuning", "analytics review"],
    cta: "Start support checkout",
    ctaHref: "/api/billing/checkout",
    featured: true,
  },
]

export const FARM_OPERATING_RULES = [
  "No spam or mass automation.",
  "No fake accounts, reviews, or testimonials.",
  "No privacy abuse or private-data scraping.",
  "No hidden affiliate links or undisclosed sponsorships.",
  "No misleading income claims.",
  "Human approval is required before any outreach or posting.",
]
