export type EthicalAgentFarmCheckoutOffer = {
  slug: string
  name: string
  priceLabel: string
  priceIdEnv: string
  requestPath: string
  successPath: string
}

export const ETHICAL_AGENT_FARM_CHECKOUT_OFFERS: EthicalAgentFarmCheckoutOffer[] = [
  {
    slug: "quick-marketing-audit",
    name: "Quick Marketing Audit",
    priceLabel: "$49",
    priceIdEnv: "ETHICAL_AGENT_QUICK_MARKETING_AUDIT_PRICE_ID",
    requestPath: "/ethical-agent-farm/request?offer=quick-marketing-audit",
    successPath: "/ethical-agent-farm/checkout/success?offer=quick-marketing-audit",
  },
  {
    slug: "social-content-pack",
    name: "Social Content Pack",
    priceLabel: "$99",
    priceIdEnv: "ETHICAL_AGENT_SOCIAL_CONTENT_PACK_PRICE_ID",
    requestPath: "/ethical-agent-farm/request?offer=social-content-pack",
    successPath: "/ethical-agent-farm/checkout/success?offer=social-content-pack",
  },
  {
    slug: "website-profile-review",
    name: "Website / Google Profile Review",
    priceLabel: "$199",
    priceIdEnv: "ETHICAL_AGENT_WEBSITE_PROFILE_REVIEW_PRICE_ID",
    requestPath: "/ethical-agent-farm/request?offer=website-profile-review",
    successPath: "/ethical-agent-farm/checkout/success?offer=website-profile-review",
  },
  {
    slug: "business-cleanup-plan",
    name: "Business Cleanup Plan",
    priceLabel: "$297",
    priceIdEnv: "ETHICAL_AGENT_BUSINESS_CLEANUP_PLAN_PRICE_ID",
    requestPath: "/ethical-agent-farm/request?offer=business-cleanup-plan",
    successPath: "/ethical-agent-farm/checkout/success?offer=business-cleanup-plan",
  },
]

export function getEthicalAgentFarmCheckoutOffer(slug: string) {
  return ETHICAL_AGENT_FARM_CHECKOUT_OFFERS.find((offer) => offer.slug === slug)
}

export function getEthicalAgentFarmCheckoutPriceId(slug: string) {
  const offer = getEthicalAgentFarmCheckoutOffer(slug)
  if (!offer) {
    return null
  }

  const priceId = process.env[offer.priceIdEnv]?.trim()
  return priceId || null
}

export function getEthicalAgentFarmCheckoutFallbackPath(slug: string) {
  return getEthicalAgentFarmCheckoutOffer(slug)?.requestPath || "/ethical-agent-farm/request"
}

export function getEthicalAgentFarmCheckoutSuccessPath(slug: string) {
  return getEthicalAgentFarmCheckoutOffer(slug)?.successPath || "/ethical-agent-farm/checkout/success"
}
