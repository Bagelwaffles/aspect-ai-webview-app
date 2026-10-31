/**
 * Preview owner diagnostics ONLY: read-only Stripe sandbox identity and
 * unauthenticated Resend API transport reachability. No Resend administrative
 * credential, payments, email, webhook delivery or Vercel API token.
 */
import Stripe from "stripe"
import { AMS_RESEND_DOMAIN_ID } from "./quick-audit-resend-domain-proof"
import { AMS_PILOT_STRIPE_ACCOUNT, pilotStorageConfiguration } from "./quick-audit-isolated-stripe-pilot"

type CheckResult = Readonly<{
  stripeSandboxIdentityVerified: boolean
  resendApiResponded: boolean
  resendDomainApiProofVerified: false
  stripeOriginWebhookVerified: false
  paymentPerformed: false
  emailSent: false
  allOperationalSwitchesOff: boolean
}>

const requiredOff = [
  "AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED",
  "AMS_STRIPE_PILOT_FULFILLMENT_ENABLED",
  "AMS_QUICK_AUDIT_PILOT_DISPATCH_ENABLED",
  "AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED",
  "AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED",
] as const

export async function probeOwnerPilotProviderConnectivity(input: {
  env: NodeJS.ProcessEnv
  readSandboxAccountId?: (testKey: string) => Promise<string>
  fetcher?: typeof fetch
}): Promise<{ ok: boolean; code: string; checks: CheckResult }> {
  const env = input.env
  const allOperationalSwitchesOff = requiredOff.every(name => env[name] !== "true")
  const blank: CheckResult = {
    stripeSandboxIdentityVerified: false, resendApiResponded: false,
    resendDomainApiProofVerified: false, stripeOriginWebhookVerified: false,
    paymentPerformed: false, emailSent: false,
    allOperationalSwitchesOff,
  }
  if (!allOperationalSwitchesOff ||
      !pilotStorageConfiguration(env).ready ||
      !env.AMS_STRIPE_PILOT_TEST_SECRET_KEY?.startsWith("sk_test_")) {
    return { ok: false, code: "OWNER_PILOT_PROVIDER_CONNECTIVITY_BLOCKED", checks: blank }
  }

  // Only remote read: verify that existing restricted test key belongs to
  // the intended, newly isolated Stripe sandbox. No object is created.
  const read = input.readSandboxAccountId ??
    (async (key: string) => {
      const stripe = new Stripe(key, { timeout: 6000, maxNetworkRetries: 0 })
      return (await stripe.accounts.retrieve()).id
    })
  const fetcher = input.fetcher ?? fetch
  const [account, resend] = await Promise.allSettled([
    read(env.AMS_STRIPE_PILOT_TEST_SECRET_KEY),
    fetcher(`https://api.resend.com/domains/${AMS_RESEND_DOMAIN_ID}`, {
      method: "GET", redirect: "error", cache: "no-store",
      signal: AbortSignal.timeout(6000),
      headers: { "Accept": "application/json" },
      // Intentionally no Authorization header; only TLS/connectivity can be tested.
    }),
  ])
  const stripeSandboxIdentityVerified =
    account.status === "fulfilled" &&
    account.value === AMS_PILOT_STRIPE_ACCOUNT
  // Any provider HTTP response proves routing/TLS succeeded, not authorization
  // or domain proof. A 401/403 is expected without the Full Access key.
  const resendApiResponded = resend.status === "fulfilled" &&
    resend.value.status >= 100 && resend.value.status <= 599
  const checks: CheckResult = {
    ...blank, stripeSandboxIdentityVerified, resendApiResponded,
  }
  return {
    ok: stripeSandboxIdentityVerified && resendApiResponded,
    code: stripeSandboxIdentityVerified && resendApiResponded
      ? "OWNER_PILOT_SECURE_RUNTIME_CONNECTIVITY_PASSED"
      : "OWNER_PILOT_SECURE_RUNTIME_CONNECTIVITY_PARTIAL",
    checks,
  }
}
