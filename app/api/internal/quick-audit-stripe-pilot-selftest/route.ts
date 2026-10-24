/**
 * Signed-in AMS owner only: exercise the deployed Preview Stripe HMAC receipt
 * handler against the isolated Redis datastore, without external CLI access.
 * POST only, no Stripe network call or payment. Never grants a send action.
 */
import { NextRequest, NextResponse } from "next/server"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { createIsolatedPilotStores } from "@/lib/server/quick-audit-isolated-pilot-stores"
import { runOwnerSignedStripePilotProbe } from "@/lib/server/quick-audit-stripe-pilot-selftest"
import { pilotIntakeConfiguration } from "@/lib/server/quick-audit-isolated-stripe-pilot"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(code: string, status: number) {
  return NextResponse.json({
    ok: false, code, stripeOriginVerified: false,
    paymentTestPerformed: false, emailSent: false,
  }, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!auth.ok) return json(auth.code, auth.status)
  const env = process.env
  // Require all actual webhook/fulfillment/send switches to remain OFF.
  if ([
    "AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED",
    "AMS_STRIPE_PILOT_FULFILLMENT_ENABLED",
    "AMS_QUICK_AUDIT_PILOT_DISPATCH_ENABLED",
    "AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED",
    "AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED",
  ].some(name => env[name] === "true")) return json("PILOT_SELFTEST_REQUIRES_ALL_SWITCHES_OFF", 503)

  // The temporary override exists in this invocation only; it neither
  // changes process.env nor alters the branch-scoped Vercel configuration.
  const localEnv = { ...env, AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED: "true" }
  if (!pilotIntakeConfiguration(localEnv).ready) {
    return json("PILOT_ISOLATED_STORAGE_NOT_CONFIGURED", 503)
  }

  try {
    const adapters = createIsolatedPilotStores(localEnv)
    if (!adapters) return json("PILOT_ISOLATED_STORAGE_UNAVAILABLE", 503)
    const result = await runOwnerSignedStripePilotProbe(env, adapters.eventReceipts)
    return NextResponse.json(result, {
      status: result.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    })
  } catch {
    return json("PILOT_SIGNED_SELFTEST_UNAVAILABLE", 503)
  }
}

export async function GET() {
  return json("PILOT_SELFTEST_POST_ONLY", 405)
}
