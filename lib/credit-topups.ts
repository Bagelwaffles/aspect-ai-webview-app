export type CreditTopupPackSlug = "100" | "300" | "1000"

export type CreditTopupPack = {
  slug: CreditTopupPackSlug
  units: number
  priceCents: number
  priceLabel: string
  lookupKey: string
  name: string
}

export const CREDIT_TOPUP_PACKS: readonly CreditTopupPack[] = [
  {
    slug: "100",
    units: 100,
    priceCents: 1_900,
    priceLabel: "$19",
    lookupKey: "ams_credit_topup_100",
    name: "100 credits",
  },
  {
    slug: "300",
    units: 300,
    priceCents: 4_900,
    priceLabel: "$49",
    lookupKey: "ams_credit_topup_300",
    name: "300 credits",
  },
  {
    slug: "1000",
    units: 1_000,
    priceCents: 12_900,
    priceLabel: "$129",
    lookupKey: "ams_credit_topup_1000",
    name: "1,000 credits",
  },
] as const

export function isCreditTopupPackSlug(value: unknown): value is CreditTopupPackSlug {
  return value === "100" || value === "300" || value === "1000"
}

export function creditTopupPack(slug: CreditTopupPackSlug): CreditTopupPack {
  const pack = CREDIT_TOPUP_PACKS.find((candidate) => candidate.slug === slug)
  if (!pack) throw new Error("UNKNOWN_CREDIT_TOPUP_PACK")
  return pack
}

export function creditTopupPackFromUnits(units: number): CreditTopupPack | null {
  return CREDIT_TOPUP_PACKS.find((candidate) => candidate.units === units) ?? null
}

export function isAndroidWebViewUserAgent(userAgent: string | null | undefined): boolean {
  const value = userAgent?.trim() ?? ""
  if (!value) return false
  return /;\s*wv\)/i.test(value) || /\bwv\b/i.test(value)
}
