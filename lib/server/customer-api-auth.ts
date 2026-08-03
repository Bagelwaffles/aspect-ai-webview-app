import { getServerSession, type Session } from "next-auth"
import type { NextRequest } from "next/server"

import {
  authOptions,
  isCustomerAuthConfigured,
  isStableCustomerSubject,
} from "@/lib/auth"
import { isInternalApiAuthorized } from "@/lib/server/internal-api-auth"

export type CustomerApiPrincipal = {
  kind: "customer"
  /** Stable authorization and ownership key derived from the signed JWT subject. */
  subject: string
  /** Billing lookup only. Never use email as an authorization or ownership key. */
  billingEmail: string
  /** Compatibility alias for existing billing and entitlement call sites. */
  email: string
}

export type InternalApiPrincipal = {
  kind: "internal"
  subject: "internal-api"
}

/**
 * Kept as a union so existing route code remains source-compatible. The
 * authorizePaidApiRequest compatibility function now returns customers only.
 */
export type PaidApiPrincipal = CustomerApiPrincipal | InternalApiPrincipal

export type CustomerAuthDependencies = {
  isConfigured: () => boolean
  getSession: () => Promise<Session | null>
}

const defaultCustomerAuthDependencies: CustomerAuthDependencies = {
  isConfigured: isCustomerAuthConfigured,
  getSession: () => getServerSession(authOptions),
}

function normalizeBillingEmail(value: unknown): string | null {
  if (typeof value !== "string") return null

  const normalized = value.trim().toLowerCase()
  return normalized ? normalized : null
}

export function customerPrincipalFromSession(session: Session | null): CustomerApiPrincipal | null {
  const subject = session?.user?.customerSubject
  const billingEmail = normalizeBillingEmail(session?.user?.email)

  if (!isStableCustomerSubject(subject) || !billingEmail) {
    return null
  }

  return {
    kind: "customer",
    subject,
    billingEmail,
    email: billingEmail,
  }
}

/**
 * Authorizes only a signed customer session. The request argument is retained
 * for route compatibility, but bearer credentials are intentionally ignored.
 */
export async function authorizeCustomerApiRequest(
  _request: NextRequest,
  dependencies: CustomerAuthDependencies = defaultCustomerAuthDependencies,
): Promise<CustomerApiPrincipal | null> {
  if (!dependencies.isConfigured()) return null

  try {
    const session = await dependencies.getSession()
    return customerPrincipalFromSession(session)
  } catch {
    return null
  }
}

/**
 * Compatibility name used by current paid routes. It is customer-only at
 * runtime; internal bearer keys no longer bypass customer entitlements.
 */
export async function authorizePaidApiRequest(
  request: NextRequest,
): Promise<PaidApiPrincipal | null> {
  return authorizeCustomerApiRequest(request)
}

/** Internal routes must opt into this path explicitly. */
export function authorizeInternalApiRequest(request: NextRequest): InternalApiPrincipal | null {
  return isInternalApiAuthorized(request)
    ? { kind: "internal", subject: "internal-api" }
    : null
}
