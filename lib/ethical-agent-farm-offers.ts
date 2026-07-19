export type EthicalOfferPage = {
  slug: string
  name: string
  price: string
  whoItIsFor: string
  buyerGets: string[]
  deliveryExpectation: string
  ethicalNote: string
  ctaLabel: string
  requestPath: string
}

export const ETHICAL_AGENT_FARM_OFFERS: EthicalOfferPage[] = [
  {
    slug: "quick-marketing-audit",
    name: "Quick Marketing Audit",
    price: "$49",
    whoItIsFor: "Small businesses that need a fast outside view of their current marketing.",
    buyerGets: ["5 visible problems", "5 practical fixes", "sample headline", "sample offer", "sample post"],
    deliveryExpectation: "Review within 1-2 business days after request approval.",
    ethicalNote: "Useful guidance only. No revenue guarantees or fake claims.",
    ctaLabel: "Request this offer",
    requestPath: "/ethical-agent-farm/request?offer=quick-marketing-audit",
  },
  {
    slug: "social-content-pack",
    name: "Social Content Pack",
    price: "$99",
    whoItIsFor: "Businesses that need a small set of usable posts and hooks.",
    buyerGets: ["10 post ideas", "5 ready-to-use posts", "CTA set", "light brand angle"],
    deliveryExpectation: "Draft set delivered after review and intake completion.",
    ethicalNote: "Content is tailored to real business messaging, not hype or spam.",
    ctaLabel: "Request this offer",
    requestPath: "/ethical-agent-farm/request?offer=social-content-pack",
  },
  {
    slug: "website-profile-review",
    name: "Website / Google Profile Review",
    price: "$199",
    whoItIsFor: "Businesses that need stronger conversion, clarity, and local trust signals.",
    buyerGets: ["site critique", "Google profile notes", "conversion fixes", "priority checklist"],
    deliveryExpectation: "Review delivered after intake and source review.",
    ethicalNote: "No fake rankings, no misleading guarantees, just specific improvements.",
    ctaLabel: "Request this offer",
    requestPath: "/ethical-agent-farm/request?offer=website-profile-review",
  },
  {
    slug: "business-cleanup-plan",
    name: "Business Cleanup Plan",
    price: "$297",
    whoItIsFor: "Owners who need sharper positioning and a cleaner funnel.",
    buyerGets: ["offer cleanup", "homepage fixes", "content priorities", "next 7-day plan"],
    deliveryExpectation: "Plan drafted after request review and business context intake.",
    ethicalNote: "Built to improve clarity and execution, not to promise outcomes.",
    ctaLabel: "Request this offer",
    requestPath: "/ethical-agent-farm/request?offer=business-cleanup-plan",
  },
  {
    slug: "monthly-marketing-support",
    name: "Monthly Marketing Support",
    price: "$497/month",
    whoItIsFor: "Teams that want ongoing audits, content support, and light execution help.",
    buyerGets: ["monthly audit", "content support", "offer tuning", "analytics review"],
    deliveryExpectation: "Subscription checkout starts immediately through Stripe.",
    ethicalNote: "Uses the live checkout path and existing billing protections.",
    ctaLabel: "Start checkout",
    requestPath: "/billing",
  },
]

export function getEthicalOfferPage(slug: string) {
  return ETHICAL_AGENT_FARM_OFFERS.find((offer) => offer.slug === slug)
}
