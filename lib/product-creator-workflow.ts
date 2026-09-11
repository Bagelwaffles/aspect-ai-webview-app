export type ProductCreatorType = "digital-download" | "service-package" | "course" | "membership" | "physical-product"
export type ProductCreatorTone = "professional" | "friendly" | "confident" | "educational" | "conversational"

export type ProductCreatorWorkflowInput = {
  businessName: string
  audience: string
  productType: ProductCreatorType
  concept: string
  customerOutcome: string
  deliverables: string
  tone: ProductCreatorTone
  pricePositioning?: string
  constraints?: string
}

export type ProductCreatorContentBrief = {
  businessName: string
  audience: string
  goal: string
  channel: "website"
  tone: ProductCreatorTone
  offer?: string
}

const TYPE_LABELS: Record<ProductCreatorType, string> = {
  "digital-download": "digital download",
  "service-package": "service package",
  course: "course starter product",
  membership: "membership starter kit",
  "physical-product": "physical product production brief",
}

function clean(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

function cleanAndLimit(value: string, maxLength: number): string {
  return clean(value).slice(0, maxLength).trim()
}

export function buildProductCreatorContentBrief(
  input: ProductCreatorWorkflowInput,
): ProductCreatorContentBrief {
  const concept = cleanAndLimit(input.concept, 40)
  const outcome = cleanAndLimit(input.customerOutcome, 40)
  const deliverables = cleanAndLimit(input.deliverables, 40)
  const constraints = cleanAndLimit(input.constraints ?? "", 20)
  const pricePositioning = cleanAndLimit(input.pricePositioning ?? "", 300)
  const physical = input.productType === "physical-product"

  const completionRule = physical
    ? "Body headings: PRODUCTION BRIEF, then SELLER LAUNCH KIT. Specify a buildable product brief; never claim the item was manufactured."
    : "Body headings: CUSTOMER DELIVERABLE, then SELLER LAUNCH KIT. Complete a usable first-version deliverable before sales copy."

  const goal = [
    `Create the actual ${TYPE_LABELS[input.productType]}, not only an offer idea.`,
    `Concept: ${concept}.`,
    `Outcome: ${outcome}.`,
    `Include: ${deliverables}.`,
    constraints ? `Constraints: ${constraints}.` : "",
    completionRule,
    "Seller kit: positioning, listing copy, launch assets, QA. Human review required. No invented claims.",
  ].filter(Boolean).join(" ")

  return {
    businessName: cleanAndLimit(input.businessName, 120),
    audience: cleanAndLimit(input.audience, 500),
    goal,
    channel: "website",
    tone: input.tone,
    ...(pricePositioning ? { offer: pricePositioning } : {}),
  }
}
