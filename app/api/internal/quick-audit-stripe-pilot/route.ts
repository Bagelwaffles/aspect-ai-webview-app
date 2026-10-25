/**
 * Dedicated Resend Preview branch intake for the new isolated Stripe sandbox.
 *
 * Deliberately inert in current deployment: disabled without separate Redis
 * credentials, endpoint secret and explicit intake flag. Checkout events are
 * never acknowledged as fulfilled or forwarded to production.
 */
import { handlePilotStripeWebhook, pilotReceiptOnlyWindowOpen } from "@/lib/server/quick-audit-isolated-stripe-pilot"
import { createIsolatedPilotStores } from "@/lib/server/quick-audit-isolated-pilot-stores"
import { fulfillIsolatedPilotCheckout } from "@/lib/server/quick-audit-isolated-pilot-fulfillment"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const env = process.env
  // Guard all real external receipt-only intake before opening Redis or parsing
  // a Stripe body. No silent open-ended intake window is permitted.
  if (env.AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED === "true" &&
      !pilotReceiptOnlyWindowOpen(env)) {
    return Response.json(
      { ok: false, code: "PILOT_RECEIPT_ONLY_WINDOW_CLOSED",
        fulfillmentEnabled: false, sendEnabled: false },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
  if (env.AMS_STRIPE_PILOT_FULFILLMENT_ENABLED === "true") {
    // Separate, strictly gated paid-record fulfillment. Never fall back to
    // receipt-only behavior after an attempted fulfillment configuration.
    return fulfillIsolatedPilotCheckout(request, { env })
  }
  // The guarded factory never opens the application's default Redis.
  // No audit or fulfillment occurs in this endpoint even when configured.
  let adapters: ReturnType<typeof createIsolatedPilotStores> = null
  try { adapters = createIsolatedPilotStores(env) } catch { adapters = null }
  return handlePilotStripeWebhook(request, {
    env,
    store: adapters?.eventReceipts ?? null,
  })
}

export async function GET() {
  // No endpoint identity, credentials or configuration are exposed publicly.
  return Response.json(
    { ok: false, code: "PILOT_WEBHOOK_POST_ONLY" },
    { status: 405, headers: { "Cache-Control": "no-store", Allow: "POST" } },
  )
}
