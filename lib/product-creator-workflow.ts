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
  course: "course",
  membership: "membership",
  "physical-product": "physical product concept",
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
  const concept = cleanAndLimit(input.concept, 60)
  const outcome = cleanAndLimit(input.customerOutcome, 60)
  const deliverables = cleanAndLimit(input.deliverables, 60)
  const constraints = cleanAndLimit(input.constraints ?? "", 40)
  const pricePositioning = cleanAndLimit(input.pricePositioning ?? "", 300)

  const goal = [
    `Create a structured ${TYPE_LABELS[input.productType]} offer package.`,
    `Concept: ${concept}.`,
    `Customer outcome: ${outcome}.`,
    `Deliverables: ${deliverables}.`,
    constraints ? `Constraints: ${constraints}.` : "",
    "Include positioning, package contents, listing copy, launch assets, and QA checks. Draft only; avoid unsupported claims.",
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
