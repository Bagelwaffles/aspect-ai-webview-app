/**
 * Fail-closed routing for a dedicated, potentially unprotected Vercel Preview hostname.
 * A Vercel domain exception is hostname-wide: this policy MUST run on every path,
 * including Next.js internals, before a domain exception is ever enabled.
 * This does not enable intake or authorize a payment; the POST handler still
 * requires an unexpired signed Stripe sandbox event and isolated receipt store.
 */
export const STRIPE_PILOT_INGRESS_HOST = "stripe-webhook-preview.aspectmarketingsolutions.app"
export const STRIPE_PILOT_INGRESS_PATH = "/api/internal/quick-audit-stripe-pilot"
const STRIPE_PILOT_PREVIEW_BRANCH = "feat/ams-resend-transactional-preview-20261023"

export type PilotIngressRequest = Readonly<{
  hostHeader: string | null
  urlHostname: string
  method: string
  pathname: string
  search: string
  vercelEnvironment: string | undefined
  gitBranch: string | undefined
}>

export type PilotIngressDecision = "not-ingress-host" | "allow" | "deny"

export function classifyPilotIngressRequest(input: PilotIngressRequest): PilotIngressDecision {
  const host = input.hostHeader?.toLowerCase() ?? ""
  const urlHost = input.urlHostname.toLowerCase()
  // Next.js may normalize nextUrl.hostname to an internal server origin
  // even though the incoming HTTP Host is the exact public virtual host.
  // Vercel routes requests by the Host authority before executing middleware;
  // require the exact Host and never trust X-Forwarded-Host for this decision.
  // If Next's internal URL points at the ingress host but Host does not,
  // reject instead of allowing unrelated protected application routing.
  if (host !== STRIPE_PILOT_INGRESS_HOST && urlHost !== STRIPE_PILOT_INGRESS_HOST) {
    return "not-ingress-host"
  }
  if (host !== STRIPE_PILOT_INGRESS_HOST) {
    return "deny"
  }
  if (input.vercelEnvironment !== "preview" ||
      input.gitBranch !== STRIPE_PILOT_PREVIEW_BRANCH) {
    return "deny"
  }
  if (input.method !== "POST" ||
      input.pathname !== STRIPE_PILOT_INGRESS_PATH ||
      input.search !== "") {
    return "deny"
  }
  return "allow"
}
