export function normalizeOperatorEmail(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase()
  return normalized && normalized.includes("@") ? normalized : null
}

export function configuredOperatorOwnerEmail(): string | null {
  return (
    normalizeOperatorEmail(process.env.AMS_OWNER_EMAIL) ??
    normalizeOperatorEmail(process.env.INTERNAL_ADMIN_EMAIL)
  )
}

export function isOperatorOwnerEmail(candidate: unknown): boolean {
  const expected = configuredOperatorOwnerEmail()
  const normalizedCandidate = normalizeOperatorEmail(candidate)
  return Boolean(expected && normalizedCandidate && normalizedCandidate === expected)
}
