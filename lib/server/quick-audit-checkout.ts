import { randomUUID } from "node:crypto"

import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { z } from "zod"

import { resolvePublicAppUrl } from "./stripe-entitlements"

const schema = z.object({
  businessName: z.string().trim().min(1).max(200),
  websiteUrl: z.string().trim().url().max(500).refine((value) => /^https?:\/\//i.test(value)),
  industry: z.string().trim().min(1).max(120),
  goals: z.string().trim().min(1).max(500),
  notes: z.string().trim().max(500).optional().default(""),
}).strict()

type Dependencies = {
  env: NodeJS.ProcessEnv
  idFactory: () => string
  createSession: (secretKey: string, params: Stripe.Checkout.SessionCreateParams, options: Stripe.RequestOptions) => Promise<Pick<Stripe.Checkout.Session, "id" | "url">>
}

const defaults: Dependencies = {
  env: process.env,
  idFactory: randomUUID,
  createSession: async (secretKey, params, options) => new Stripe(secretKey).checkout.sessions.create(params, options),
}

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true"
}

function fulfillmentInterlockRequired(env: NodeJS.ProcessEnv) {
  return env.NODE_ENV === "production" || env.AMS_QUICK_AUDIT_FULFILLMENT_READY !== undefined
}

export function createQuickAuditCheckoutHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }
  return async (request: NextRequest) => {
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid Quick Audit request", code: "QUICK_AUDIT_REQUEST_INVALID" }, { status: 400, headers: { "Cache-Control": "no-store" } })
    if (!enabled(dependencies.env.AMS_QUICK_AUDIT_PUBLIC_SALES_ENABLED)) {
      return NextResponse.json({ ok: false, error: "Quick Audit checkout is not available", code: "QUICK_AUDIT_SALES_DISABLED" }, { status: 503, headers: { "Cache-Control": "no-store" } })
    }
    if (fulfillmentInterlockRequired(dependencies.env) && !enabled(dependencies.env.AMS_QUICK_AUDIT_FULFILLMENT_READY)) {
      return NextResponse.json({ ok: false, error: "Quick Audit fulfillment is temporarily unavailable", code: "QUICK_AUDIT_FULFILLMENT_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } })
    }
    const secretKey = dependencies.env.AMS_STRIPE_QUICK_AUDIT_LIVE_SECRET_KEY?.trim()
    const priceId = dependencies.env.AMS_STRIPE_QUICK_AUDIT_LIVE_PRICE_ID?.trim()
    if (!secretKey || !/^(sk|rk)_live_/.test(secretKey) || !priceId?.startsWith("price_")) {
      return NextResponse.json({ ok: false, error: "Quick Audit checkout is not configured", code: "QUICK_AUDIT_CHECKOUT_UNCONFIGURED" }, { status: 503, headers: { "Cache-Control": "no-store" } })
    }
    const requestId = `quick-audit-${dependencies.idFactory()}`
    const publicUrl = resolvePublicAppUrl({ env: dependencies.env, requestOrigin: request.nextUrl.origin })
    try {
      const session = await dependencies.createSession(secretKey, {
        mode: "payment",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${publicUrl}/quick-marketing-audit/thanks?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${publicUrl}/quick-marketing-audit`,
        customer_creation: "always",
        billing_address_collection: "auto",
        automatic_tax: { enabled: false },
        allow_promotion_codes: false,
        metadata: {
          ams_offer: "quick-marketing-audit", ams_request_id: requestId,
          ams_business_name: parsed.data.businessName, ams_website_url: parsed.data.websiteUrl,
          ams_industry: parsed.data.industry, ams_goals: parsed.data.goals, ams_notes: parsed.data.notes,
        },
      }, { idempotencyKey: requestId })
      if (!session.url) throw new Error("CHECKOUT_URL_MISSING")
      return NextResponse.json({ ok: true, sessionId: session.id, url: session.url }, { headers: { "Cache-Control": "no-store" } })
    } catch {
      return NextResponse.json({ ok: false, error: "Quick Audit checkout could not be created", code: "QUICK_AUDIT_CHECKOUT_FAILED" }, { status: 502, headers: { "Cache-Control": "no-store" } })
    }
  }
}
