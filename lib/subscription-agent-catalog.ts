export const SUBSCRIPTION_INCLUDED_AGENTS = [
  { slug: "content-agent", name: "Content Agent", href: "/content-agent" },
  { slug: "lead-magnet-agent", name: "Lead Magnet Agent", href: "/lead-magnet-agent" },
  { slug: "email-campaign-agent", name: "Email Campaign Agent", href: "/email-campaign-agent" },
  { slug: "nurture-agent", name: "Nurture Agent", href: "/nurture-agent" },
  { slug: "outreach-agent", name: "Outreach Agent", href: "/outreach-agent" },
  { slug: "seo-agent", name: "SEO Agent", href: "/seo-agent" },
  { slug: "product-creator-agent", name: "Product Creator Agent", href: "/product-creator-agent" },
] as const

export const SUBSCRIPTION_INCLUDED_AGENT_COUNT = SUBSCRIPTION_INCLUDED_AGENTS.length

export const SUBSCRIPTION_INCLUDED_AGENT_NAMES = SUBSCRIPTION_INCLUDED_AGENTS
  .map((agent) => agent.name)
  .join(", ")
