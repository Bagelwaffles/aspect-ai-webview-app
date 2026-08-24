export type SeoPageType = "homepage" | "service-page" | "location-page" | "blog-post" | "product-page"
export type SeoObjective = "qualified-leads" | "local-visibility" | "organic-traffic" | "bookings" | "sales"
export type SeoTone = "professional" | "friendly" | "confident" | "educational" | "conversational"

export type SeoWorkflowInput = {
  businessName: string
  audience: string
  pageType: SeoPageType
  topic: string
  location?: string
  objective: SeoObjective
  tone: SeoTone
  offer?: string
}

export type ContentAgentBrief = {
  businessName: string
  audience: string
  goal: string
  channel: "website"
  tone: SeoTone
  offer?: string
}

const PAGE_LABELS: Record<SeoPageType, string> = {
  homepage: "homepage",
  "service-page": "service page",
  "location-page": "local landing page",
  "blog-post": "blog post",
  "product-page": "product page",
}

const OBJECTIVE_LABELS: Record<SeoObjective, string> = {
  "qualified-leads": "attract qualified leads",
  "local-visibility": "improve local search relevance",
  "organic-traffic": "increase useful organic discovery",
  bookings: "support more qualified bookings",
  sales: "support more qualified purchase intent",
}

function clean(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

function clip(value: string, max: number): string {
  return clean(value).slice(0, max).trim()
}

export function buildSeoContentBrief(input: SeoWorkflowInput): ContentAgentBrief {
  const pageType = PAGE_LABELS[input.pageType]
  const topic = clip(input.topic, 120)
  const location = clip(input.location ?? "", 70)
  const objective = OBJECTIVE_LABELS[input.objective]
  const offer = clean(input.offer ?? "")

  const goal = [
    `Create an on-page SEO optimization brief for a ${pageType}.`,
    `Topic/service: ${topic}.`,
    location ? `Geographic focus: ${location}.` : "",
    `Objective: ${objective}.`,
    "Recommend search intent, title/meta direction, page structure, headings, internal links, FAQs, and content improvements.",
    "Treat keywords as hypotheses only; never invent rankings, volume, traffic, competitor data, or live-search findings.",
  ].filter(Boolean).join(" ").slice(0, 500).trim()

  return {
    businessName: clean(input.businessName),
    audience: clean(input.audience),
    goal,
    channel: "website",
    tone: input.tone,
    ...(offer ? { offer } : {}),
  }
}
