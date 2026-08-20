import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

import type { StripeEventClaim } from "./entitlements"
import {
  processQuickAuditCheckout,
  QuickAuditFulfillmentError,
  RedisQuickAuditStore,
  type QuickAuditAuditGateway,
  type QuickAuditEvidence,
  type QuickAuditStore,
  type QuickAuditStripeGateway,
} from "./quick-audit-fulfillment"
import { createNativeQuickAuditAuditGateway } from "./quick-audit-native"

type Dependencies = {
  env: NodeJS.ProcessEnv
  createStripe: (key: string) => Stripe
  claimEvent: (eventId: string) => Promise<StripeEventClaim>
  completeEvent: (eventId: string, token: string) => Promise<void>
  releaseEvent: (eventId: string, token: string) => Promise<void>
  store: QuickAuditStore
  auditGateway: QuickAuditAuditGateway
  evidenceCollector?: (url: string) => Promise<QuickAuditEvidence>
}

export function createQuickAuditWebhookHandler(dependencies: Dependencies) {
  return async function tryQuickAuditWebhook(request: NextRequest): Promise<Response | null> {
    const signature = request.headers.get("stripe-signature")
    if (!signature) return null
    const rawBody = await request.text()
    const sharedWebhookSecret = dependencies.env.STRIPE_WEBHOOK_SECRET?.trim()
    const sharedWebhookMode = (dependencies.env.AMS_STRIPE_WEBHOOK_MODE ?? "test").trim().toLowerCase()
    const configurations = [
      {
        secretKey: dependencies.env.AMS_STRIPE_QUICK_AUDIT_SECRET_KEY?.trim(),
        webhookSecret: (
          dependencies.env.AMS_STRIPE_QUICK_AUDIT_WEBHOOK_SECRET ??
          (sharedWebhookMode === "test" ? sharedWebhookSecret : undefined)
        )?.trim(),
        priceId: dependencies.env.AMS_STRIPE_QUICK_AUDIT_PRICE_ID?.trim(),
        livemode: false,
      },
      {
        secretKey: dependencies.env.AMS_STRIPE_QUICK_AUDIT_LIVE_SECRET_KEY?.trim(),
        webhookSecret: (
          dependencies.env.AMS_STRIPE_QUICK_AUDIT_LIVE_WEBHOOK_SECRET ??
          (sharedWebhookMode === "live" ? sharedWebhookSecret : undefined)
        )?.trim(),
        priceId: dependencies.env.AMS_STRIPE_QUICK_AUDIT_LIVE_PRICE_ID?.trim(),
        livemode: true,
      },
    ].filter((config) => config.secretKey && config.webhookSecret && config.priceId)
    let matched: typeof configurations[number] | undefined
    let stripe: Stripe | undefined
    let event: Stripe.Event | undefined
    for (const config of configurations) {
      const candidate = dependencies.createStripe(config.secretKey!)
      try {
        event = candidate.webhooks.constructEvent(rawBody, signature, config.webhookSecret!)
        matched = config
        stripe = candidate
        break
      } catch { continue }
    }
    if (!event || !matched || !stripe) return null
    const expectedPrefix = matched.livemode ? /^(sk|rk)_live_/ : /^(sk|rk)_test_/
    if (!expectedPrefix.test(matched.secretKey!)) return NextResponse.json({ ok: false, error: "Quick Audit fulfillment mode is invalid", code: "QUICK_AUDIT_MODE_INVALID" }, { status: 503 })
    if (event.livemode !== matched.livemode) return NextResponse.json({ ok: false, error: "Quick Audit event mode is invalid", code: "QUICK_AUDIT_MODE_MISMATCH" }, { status: 400 })
    if (event.type !== "checkout.session.completed") {
      return null
    }
    const session = event.data.object as Stripe.Checkout.Session
    if (session.mode !== "payment") return null
    if (session.metadata?.ams_offer !== "quick-marketing-audit") return null

    let claim: StripeEventClaim
    try { claim = await dependencies.claimEvent(event.id) } catch {
      return NextResponse.json({ ok: false, error: "Webhook event store unavailable", code: "EVENT_STORE_UNAVAILABLE" }, { status: 503 })
    }
    if (claim.state === "completed") return NextResponse.json({ ok: true, received: true, processed: false, duplicate: true })
    if (claim.state === "processing") return NextResponse.json({ ok: false, error: "Webhook event is already processing", code: "EVENT_IN_PROGRESS" }, { status: 503 })

    const gateway: QuickAuditStripeGateway = {
      retrieveCheckoutSession: (id) => stripe.checkout.sessions.retrieve(id),
      listLineItems: (id) => stripe.checkout.sessions.listLineItems(id, { limit: 10 }),
    }
    try {
      const result = await processQuickAuditCheckout({
        event, gateway, store: dependencies.store, auditGateway: dependencies.auditGateway,
        evidenceCollector: dependencies.evidenceCollector, expectedPriceId: matched.priceId!, expectedLivemode: matched.livemode,
      })
      await dependencies.completeEvent(event.id, claim.token)
      console.info(`[Stripe] Processed ${event.type} for Quick Audit`)
      return NextResponse.json({ ok: true, received: true, ...result })
    } catch (error) {
      await dependencies.releaseEvent(event.id, claim.token).catch(() => undefined)
      const status = error instanceof QuickAuditFulfillmentError ? error.httpStatus : 500
      const code = error instanceof QuickAuditFulfillmentError ? error.code : "QUICK_AUDIT_FULFILLMENT_FAILED"
      console.error(`[Stripe] Quick Audit fulfillment failed for ${event.type}`)
      return NextResponse.json({ ok: false, error: "Quick Audit fulfillment failed", code }, { status })
    }
  }
}

export function defaultQuickAuditWebhookDependencies(input: {
  env: NodeJS.ProcessEnv
  claimEvent: Dependencies["claimEvent"]
  completeEvent: Dependencies["completeEvent"]
  releaseEvent: Dependencies["releaseEvent"]
}): Dependencies {
  return {
    ...input,
    createStripe: (key) => new Stripe(key),
    store: new RedisQuickAuditStore(),
    auditGateway: createNativeQuickAuditAuditGateway(),
  }
}
