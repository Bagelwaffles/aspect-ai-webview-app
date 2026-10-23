/**
 * Administrative domain verification, separate from Resend's email sending.
 *
 * A one-time owner-only verification process may call this using an
 * administrative Resend credential, then save the resulting short-lived proof
 * in a protected Preview-only store. Never give that credential to the mail
 * dispatcher. This module does not persist, send, schedule, or expose routes.
 */
export const AMS_RESEND_DOMAIN = "aspectmarketingsolutions.app"
export const AMS_RESEND_DOMAIN_ID = "60c30272-c705-493a-9be4-0b7df9ab31c8"
export type ResendVerifiedDomainProof = Readonly<{
  domainId: string
  domainName: string
  status: "verified"
  sending: "enabled"
  source: "resend-domain-api"
  verifiedAt: string
}>

export async function inspectResendDomainForOwner(input: {
  fullAccessKey: string
  fetcher?: typeof fetch
  now?: Date
}): Promise<ResendVerifiedDomainProof | null> {
  if (!input.fullAccessKey?.trim()) return null
  const fetcher = input.fetcher ?? fetch
  try {
    const res = await fetcher(
      `https://api.resend.com/domains/${AMS_RESEND_DOMAIN_ID}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${input.fullAccessKey}` },
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      },
    )
    if (!res.ok) return null
    const json: unknown = await res.json()
    if (!json || typeof json !== "object") return null
    const obj = json as Record<string, unknown>
    if (obj.id !== AMS_RESEND_DOMAIN_ID ||
        obj.name !== AMS_RESEND_DOMAIN ||
        obj.status !== "verified" ||
        !obj.capabilities || typeof obj.capabilities !== "object" ||
        (obj.capabilities as Record<string, unknown>).sending !== "enabled") {
      return null
    }
    const date = input.now ?? new Date()
    if (!Number.isFinite(date.getTime())) return null
    return {
      domainId: AMS_RESEND_DOMAIN_ID,
      domainName: AMS_RESEND_DOMAIN,
      status: "verified",
      sending: "enabled",
      source: "resend-domain-api",
      verifiedAt: date.toISOString(),
    }
  } catch {
    return null
  }
}

/**
 * Validation for a separately persisted proof; positive evidence is only
 * current within fifteen minutes. Administrative verification must be
 * re-performed on expiry, never self-renewed by the send-only worker.
 */
export function hasCurrentResendDomainProof(
  raw: unknown,
  now = new Date(),
): raw is ResendVerifiedDomainProof {
  if (!raw || typeof raw !== "object") return false
  const obj = raw as Record<string, unknown>
  const verifiedAt = obj.verifiedAt
  if (typeof verifiedAt !== "string") return false
  const ageMs = now.getTime() - Date.parse(verifiedAt)
  return obj.domainId === AMS_RESEND_DOMAIN_ID &&
    obj.domainName === AMS_RESEND_DOMAIN &&
    obj.status === "verified" &&
    obj.sending === "enabled" &&
    obj.source === "resend-domain-api" &&
    Number.isFinite(ageMs) &&
    ageMs >= 0 && ageMs < 15 * 60_000
}
