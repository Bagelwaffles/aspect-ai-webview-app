import type { ProductCreatorType } from "./product-creator-workflow"

export type ProductArtifactParts = {
  deliverableHeading: string
  deliverableBody: string
  sellerLaunchKit: string
  physicalProductionBrief: boolean
}

function stripLeadingHeading(value: string, headings: string[]): string {
  const trimmed = value.trim()
  for (const heading of headings) {
    const pattern = new RegExp(`^\\s*(?:#{1,6}\\s*)?${heading}\\s*:?\\s*`, "i")
    if (pattern.test(trimmed)) return trimmed.replace(pattern, "").trim()
  }
  return trimmed
}

export function splitProductArtifactBody(
  body: string,
  productType: ProductCreatorType,
): ProductArtifactParts {
  const marker = /(?:^|\n)\s*(?:#{1,6}\s*)?SELLER LAUNCH KIT\s*:?\s*(?:\n|$)/i
  const match = marker.exec(body)
  const before = match ? body.slice(0, match.index) : body
  const after = match ? body.slice(match.index + match[0].length) : ""
  const physical = productType === "physical-product"
  const deliverableHeading = physical ? "Production Brief" : "Customer Deliverable"

  return {
    deliverableHeading,
    deliverableBody: stripLeadingHeading(before, ["CUSTOMER DELIVERABLE", "PRODUCTION BRIEF"]),
    sellerLaunchKit: after.trim(),
    physicalProductionBrief: physical,
  }
}
