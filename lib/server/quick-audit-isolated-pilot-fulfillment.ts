/**
 * Real fulfillment logic restricted to one independently isolated Stripe
 * sandbox. Disabled until standalone payment storage, signing secret,
 * test API key and isolated Price ID are verified and explicitly armed.
 * No outbound customer or owner email may be sent from a webhook.
 */
import Stripe from "stripe"
import { processQuickAuditCheckout, QuickAuditFulfillmentError } from "./quick-audit-fulfillment"
import { createIsolatedPilotStores } from "./quick-audit-isolated-pilot-stores"
import {
  AMS_PILOT_STRIPE_ACCOUNT,
  pilotFulfillmentConfiguration,
} from "./quick-audit-isolated-stripe-pilot"

function response(status: number, code: string) {
  return Response.json({ ok: status === 200, code, sendEnabled: false,
    customerEmailSent: false }, {
      status, headers: { "Cache-Control": "no-store" },
    })
}

export async function fulfillIsolatedPilotCheckout(
  request: Request,
  input: {
    env: NodeJS.ProcessEnv
    makeStripe?: (secret: string) => Stripe
    stores?: ReturnType<typeof createIsolatedPilotStores>
  },
): Promise<Response> {
  const env = input.env
  if (!pilotFulfillmentConfiguration(env).ready) {
    return response(503, "PILOT_FULFILLMENT_DISABLED")
  }

  let stores: ReturnType<typeof createIsolatedPilotStores>
  try {
    stores = input.stores ?? createIsolatedPilotStores(env, undefined, "fulfillment")
  } catch {
    stores = null
  }
  if (!stores) return response(503, "PILOT_STORAGE_UNAVAILABLE")

  const sig = request.headers.get("stripe-signature")
  if (!sig) return response(400, "PILOT_SIGNATURE_MISSING")
  const raw = await request.text().catch(() => "")
  if (!raw || Buffer.byteLength(raw, "utf8") > 256_000) {
    return response(413, "PILOT_WEBHOOK_PAYLOAD_INVALID")
  }

  let stripe: Stripe
  let event: Stripe.Event
  try {
    stripe = (input.makeStripe ?? ((key) => new Stripe(key)))(
      env.AMS_STRIPE_PILOT_TEST_SECRET_KEY!,
    )
    event = stripe.webhooks.constructEvent(
      raw, sig, env.AMS_STRIPE_PILOT_WEBHOOK_SECRET!,
    )
  } catch {
    return response(400, "PILOT_SIGNATURE_INVALID")
  }
  if (event.livemode !== false ||
      (event.account && event.account !== AMS_PILOT_STRIPE_ACCOUNT) ||
      !/^evt_[A-Za-z0-9]{8,200}$/u.test(event.id)) {
    return response(403, "PILOT_EVENT_SCOPE_DENIED")
  }
  if (event.type !== "checkout.session.completed") {
    return response(200, "PILOT_EVENT_IGNORED")
  }
  const session = event.data.object as Stripe.Checkout.Session
  if (!/^cs_test_[A-Za-z0-9]{8,200}$/u.test(session.id) ||
      session.mode !== "payment" ||
      session.metadata?.ams_offer !== "quick-marketing-audit") {
    return response(200, "PILOT_UNRELATED_CHECKOUT_IGNORED")
  }

  // Read-only account retrieval proves this sandbox key cannot silently
  // reach the original live Stripe account or older AMS test sandboxes.
  try {
    const account = await stripe.accounts.retrieve()
    if (account.id !== AMS_PILOT_STRIPE_ACCOUNT) {
      return response(503, "PILOT_STRIPE_ACCOUNT_UNVERIFIED")
    }
  } catch {
    return response(503, "PILOT_STRIPE_ACCOUNT_UNVERIFIED")
  }

  try {
    const result = await processQuickAuditCheckout({
      event,
      gateway: {
        retrieveCheckoutSession: id => stripe.checkout.sessions.retrieve(id),
        listLineItems: id => stripe.checkout.sessions.listLineItems(id, { limit: 10 }),
      },
      store: stores.payment,
      auditGateway: stores.auditGateway,
      expectedPriceId: env.AMS_STRIPE_PILOT_PRICE_ID!,
      expectedLivemode: false,
      // Queue ONLY the configured owner, never a customer address and never
      // a send operation. The manual owner API is separately gated.
      onFulfilled: env.AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED === "true"
        ? async record => {
            const owner = env.AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL!.trim().toLowerCase()
            if (record.recipient.trim().toLowerCase() !== owner) return
            await stores.outbox.enqueue({
              auditId: record.auditId,
              requestId: record.requestId,
              checkoutSessionId: record.checkoutSessionId,
              recipient: owner,
              paidAndPersisted: true,
            })
          }
        : undefined,
    })
    return Response.json({
      ok: true,
      code: result.duplicate ? "PILOT_DUPLICATE" : result.reason,
      processed: result.processed,
      applied: result.applied,
      ownerEmailSent: false,
      automaticDeliveryEnabled: false,
    }, { status: 200, headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const code = error instanceof QuickAuditFulfillmentError
      ? error.code : "PILOT_FULFILLMENT_FAILED"
    // Non-2xx prompts Stripe retries, while the payment store's atomic
    // reservation prevents duplicate fulfillment. Never send here.
    return response(503, code)
  }
}
