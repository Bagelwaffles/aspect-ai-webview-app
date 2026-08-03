type BillingStatusResponse = {
  ok: boolean
  billingStatus?: string
  stripe?: {
    secretKey?: string
    webhookSecret?: string
    priceId?: string
    publicKey?: string
  }
  blockers?: string[]
}

type OrganizationBillingResponse = {
  organizationId: string
  organizationSlug: string
  subscriptionStatus: string
  stripeSubscriptionId: string | null
  currentPeriodEnd: string | null
  accessEnabled: boolean
  accessWarning: boolean
  updatedAt: string
}

export type BillingSnapshot = {
  backendConfigured: boolean
  billingStatus: BillingStatusResponse | null
  organization: OrganizationBillingResponse | null
  error: string | null
}

async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<T | null> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
    })

    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  }
}

export async function getBillingSnapshot(): Promise<BillingSnapshot> {
  const backendUrl = process.env.AMS_BACKEND_URL?.trim().replace(/\/$/, "")
  const fulfillmentSecret = process.env.AMS_STRIPE_FULFILLMENT_SECRET?.trim()
  const organizationId = process.env.AMS_DEFAULT_ORGANIZATION_ID?.trim()
  const organizationSlug = process.env.AMS_DEFAULT_ORGANIZATION_SLUG?.trim()
  const backendConfigured = Boolean(backendUrl)

  if (!backendUrl || !fulfillmentSecret || !organizationId || !organizationSlug) {
    return {
      backendConfigured,
      billingStatus: null,
      organization: null,
      error: "billing_snapshot_not_configured",
    }
  }

  const authHeaders = { "x-ams-fulfillment-secret": fulfillmentSecret }
  const billingStatus = await fetchJson<BillingStatusResponse>(`${backendUrl}/internal/billing/status`, authHeaders)
  const organization = await fetchJson<OrganizationBillingResponse>(
    `${backendUrl}/internal/billing/organizations/${encodeURIComponent(organizationId)}?organizationSlug=${encodeURIComponent(organizationSlug)}`,
    authHeaders,
  )

  return {
    backendConfigured,
    billingStatus,
    organization,
    error: billingStatus && organization ? null : "billing_snapshot_unavailable",
  }
}
