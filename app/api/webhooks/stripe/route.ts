import { NextResponse } from "next/server"
import Stripe from "stripe"

import {
  applyStripeSubscriptionEntitlement,
  claimStripeEvent,
  completeStripeEvent,
  isEntitlementStoreConfigured,
  releaseStripeEvent,
  revokeStripeSubscriptionEntitlement,
} from "@/lib/server/entitlements"
import { fulfillQuickAuditCheckout } from "@/lib/server/quick-audit-fulfillment"
import {
  assertStripeSecretKeyMatchesMode,
  createStripeReadGateway,
  createStripeWebhookPostHandler,
  processStripeLifecycleEvent,
  stripeEntitlementConfigFromEnv,
} from "@/lib/server/stripe-entitlements"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const POST = createStripeWebhookPostHandler({
  env: process.env,
  isStoreConfigured: isEntitlementStoreConfigured,
  createStripe: (secretKey) => new Stripe(secretKey),
  claimEvent: claimStripeEvent,
  completeEvent: completeStripeEvent,
  releaseEvent: releaseStripeEvent,
  processEvent: async (stripe, event, config) => {
    if (event.type === "checkout.session.completed") {
      const quickAudit = await fulfillQuickAuditCheckout({ stripe, event })
      if (quickAudit.matched) {
        console.info(`[Stripe] Quick Audit fulfillment ${quickAudit.status}`)
        return {
          processed: true,
          applied: quickAudit.status === "ai_draft_ready",
          creditsReset: false,
          reason:
            quickAudit.status === "ai_draft_ready"
              ? "QUICK_AUDIT_AI_DRAFT_READY"
              : "QUICK_AUDIT_MANUAL_REVIEW_REQUIRED",
        }
      }
    }

    return processStripeLifecycleEvent({
      event,
      gateway: createStripeReadGateway(stripe),
      writer: {
        apply: applyStripeSubscriptionEntitlement,
        revoke: revokeStripeSubscriptionEntitlement,
      },
      config,
    })
  },
})

export async function GET() {
  let priceConfigurationValid = false
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim()
    if (!stripeSecretKey) throw new Error("STRIPE_SECRET_KEY_REQUIRED")
    assertStripeSecretKeyMatchesMode(stripeSecretKey, process.env)
    stripeEntitlementConfigFromEnv(process.env)
    priceConfigurationValid = true
  } catch {
    priceConfigurationValid = false
  }

  return NextResponse.json(
    {
      ok: true,
      status: "listening",
      endpoint: "/api/webhooks/stripe",
      configured: Boolean(
        process.env.STRIPE_SECRET_KEY?.trim() &&
          process.env.STRIPE_WEBHOOK_SECRET?.trim() &&
          isEntitlementStoreConfigured() &&
          priceConfigurationValid,
      ),
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
