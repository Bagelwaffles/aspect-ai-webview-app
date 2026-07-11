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

async function loginInternalActor() {
  const username = process.env.INTERNAL_AUTH_USER || "operator";
  const password = process.env.INTERNAL_AUTH_PASSWORD;

  if (!password) {
    return { ok: false as const, error: "INTERNAL_AUTH_PASSWORD_missing" };
  }

  const response = await fetch(`${getBackendUrl()}/internal/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
    cache: "no-store"
  });

  if (!response.ok) {
    return { ok: false as const, error: `internal_auth_login_failed_${response.status}` };
  }

  const cookie = response.headers.get("set-cookie");
  if (!cookie) {
    return { ok: false as const, error: "internal_auth_cookie_missing" };
  }

  return { ok: true as const, cookie };
}

async function fetchJson<T>(url: string, cookie: string): Promise<T | null> {
  const response = await fetch(url, {
    method: "GET",
    headers: { cookie },
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
}

export async function getBillingSnapshot(): Promise<BillingSnapshot> {
  const backendConfigured = Boolean(process.env.AMS_BACKEND_URL || FALLBACK_BACKEND_URL);
  const login = await loginInternalActor();

  if (!login.ok) {
    return {
      backendConfigured,
      billingStatus: null,
      organization: null,
      error: login.error
    };
  }

  const billingStatus = await fetchJson<BillingStatusResponse>(`${getBackendUrl()}/internal/billing/status`, login.cookie);
  const organization = await fetchJson<OrganizationBillingResponse>(
    `${getBackendUrl()}/internal/billing/organizations/${SAFE_ORG_ID}?organizationSlug=${encodeURIComponent(SAFE_ORG_SLUG)}`,
    login.cookie
  );

  return {
    backendConfigured,
    billingStatus,
    organization,
    error: null
  };
}

