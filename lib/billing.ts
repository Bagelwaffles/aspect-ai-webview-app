type BillingStatusResponse = {
  ok: boolean;
  billingStatus?: string;
  stripe?: {
    secretKey?: string;
    webhookSecret?: string;
    priceId?: string;
    publicKey?: string;
  };
  blockers?: string[];
};

type OrganizationBillingResponse = {
  organizationId: string;
  organizationSlug: string;
  subscriptionStatus: string;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  accessEnabled: boolean;
  accessWarning: boolean;
  updatedAt: string;
};

export type BillingSnapshot = {
  backendConfigured: boolean;
  billingStatus: BillingStatusResponse | null;
  organization: OrganizationBillingResponse | null;
  error: string | null;
};

const FALLBACK_BACKEND_URL = "https://aspectapi-production.up.railway.app";
const SAFE_ORG_ID = "cmrgmpcd50001iqyo57iirzo6";
const SAFE_ORG_SLUG = "ams-stripe-test-org";

function getBackendUrl() {
  return (process.env.AMS_BACKEND_URL || FALLBACK_BACKEND_URL).replace(/\/$/, "");
}

async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<T | null> {
  const response = await fetch(url, {
    method: "GET",
    headers,
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
}

export async function getBillingSnapshot(): Promise<BillingSnapshot> {
  const backendConfigured = Boolean(process.env.AMS_BACKEND_URL || FALLBACK_BACKEND_URL);
  const fulfillmentSecret = process.env.AMS_STRIPE_FULFILLMENT_SECRET;

  if (!fulfillmentSecret) {
    return {
      backendConfigured,
      billingStatus: null,
      organization: null,
      error: "AMS_STRIPE_FULFILLMENT_SECRET_missing"
    };
  }

  const authHeaders = {
    "x-ams-fulfillment-secret": fulfillmentSecret
  };

  const billingStatus = await fetchJson<BillingStatusResponse>(`${getBackendUrl()}/internal/billing/status`, authHeaders);
  const organization = await fetchJson<OrganizationBillingResponse>(
    `${getBackendUrl()}/internal/billing/organizations/${SAFE_ORG_ID}?organizationSlug=${encodeURIComponent(SAFE_ORG_SLUG)}`,
    authHeaders
  );

  return {
    backendConfigured,
    billingStatus,
    organization,
    error: billingStatus && organization ? null : "billing_snapshot_unavailable"
  };
}
