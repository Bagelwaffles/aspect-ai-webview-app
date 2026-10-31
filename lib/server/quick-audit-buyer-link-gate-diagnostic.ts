import { isStripeSandboxTestKey } from "./quick-audit-stripe-test-key"
/** Pure, no-I/O inspection. Never returns credentials, addresses or datastore URLs. */
type Env = Readonly<Record<string, string | undefined>>
type Pilot = { ready: boolean; code: string }
export function inspectBuyerLinkGate(env: Env, pilot: Pilot, now = Date.now()) {
  const windowState = (value: string | undefined) => {
    const until = Date.parse(value ?? "")
    return !Number.isFinite(until) ? "missing" : until <= now ? "expired" :
      until - now > 600_000 ? "too-long" : "valid"
  }
  const key = env.AMS_STRIPE_PILOT_TEST_SECRET_KEY ?? ""
  const checks = {
    pilotConfigurationReady: pilot.ready,
    previewEnvironment: env.VERCEL_ENV === "preview",
    expectedBranch: env.VERCEL_GIT_COMMIT_REF === "feat/ams-audit-buyer-link-integration-20261029",
    fulfillmentEnabled: env.AMS_STRIPE_PILOT_FULFILLMENT_ENABLED === "true",
    pilotDispatchEnabled: env.AMS_QUICK_AUDIT_PILOT_DISPATCH_ENABLED === "true",
    sendEnabled: env.AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED === "true",
    buyerDispatchEnabled: env.AMS_QUICK_AUDIT_BUYER_DISPATCH_ENABLED === "true",
    pilotWindowValid: windowState(env.AMS_QUICK_AUDIT_PILOT_DISPATCH_UNTIL) === "valid",
    buyerWindowValid: windowState(env.AMS_QUICK_AUDIT_BUYER_DISPATCH_UNTIL) === "valid",
    reportAccessRequired: env.AMS_QUICK_AUDIT_REPORT_ACCESS_REQUIRED === "true",
    buyerResultEnabled: env.AMS_QUICK_AUDIT_PILOT_BUYER_RESULT_ENABLED === "true",
    stripeTestKeyAccepted: isStripeSandboxTestKey(key),
    isolatedStripeAccount: env.AMS_STRIPE_PILOT_ACCOUNT_ID === "acct_1UTtFMGuhFCl8JHa",
    ownerRecipientMatches: Boolean(env.AMS_OWNER_EMAIL?.trim()) &&
      env.AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL?.trim().toLowerCase() === env.AMS_OWNER_EMAIL?.trim().toLowerCase(),
    checkoutOff: env.AMS_STRIPE_PILOT_CHECKOUT_ENABLED !== "true",
    handoffOff: env.AMS_STRIPE_PILOT_HANDOFF_ENABLED !== "true",
    webhookOff: env.AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED !== "true",
    outboxCreationOff: env.AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED !== "true",
  }
  return {
    ready: Object.values(checks).every(Boolean), checks, pilotCode: pilot.code,
    pilotWindow: windowState(env.AMS_QUICK_AUDIT_PILOT_DISPATCH_UNTIL),
    buyerWindow: windowState(env.AMS_QUICK_AUDIT_BUYER_DISPATCH_UNTIL),
    stripeKeyKind: key.startsWith("sk_test_") ? "standard-test" :
      key.startsWith("rk_test_") ? "restricted-test" : key ? "other" : "missing",
  }
}

/** A copy only: no process.env mutation, provider calls, proof renewal or send. */
export function buyerLinkRehearsalEnvironment(env: Env, now = Date.now()): Record<string, string | undefined> {
  const until = new Date(now + 60_000).toISOString()
  return { ...env,
    AMS_STRIPE_PILOT_FULFILLMENT_ENABLED: "true",
    AMS_QUICK_AUDIT_PILOT_DISPATCH_ENABLED: "true",
    AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "true",
    AMS_QUICK_AUDIT_BUYER_DISPATCH_ENABLED: "true",
    AMS_QUICK_AUDIT_PILOT_DISPATCH_UNTIL: until,
    AMS_QUICK_AUDIT_BUYER_DISPATCH_UNTIL: until,
  }
}
