import { randomUUID } from "node:crypto"

import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { z } from "zod"

import { verifyInternalAdminCookie } from "@/app/lib/internal-admin-cookie"

const ownerPilotSchema = z.object({
  businessName: z.string().trim().min(1).max(200),
  websiteUrl: z.string().trim().url().max(500).refine((url) => /^https?:\/\//i.test(url)),
  industry: z.string().trim().min(1).max(120),
  goals: z.string().trim().min(1).max(500),
  notes: z.string().trim().max(500).optional().default(""),
}).strict()

const PUBLIC_AUDIT_PRICE_CENTS = 4900
const PILOT_TOTAL_CENTS = 500
const PILOT_COUPON_AMOUNT_CENTS = PUBLIC_AUDIT_PRICE_CENTS - PILOT_TOTAL_CENTS

type TestCoupon = Pick<Stripe.Coupon, "id" | "amount_off" | "currency" | "duration" | "livemode" | "valid" | "max_redemptions" | "times_redeemed">
type TestPrice = Pick<Stripe.Price, "id" | "unit_amount" | "currency" | "active" | "livemode" | "type">

type Dependencies = {
  env: NodeJS.ProcessEnv
  uuid: () => string
  adminEmail: (request: NextRequest, env: NodeJS.ProcessEnv) => Promise<string | null>
  retrieveCoupon: (secret: string, couponId: string) => Promise<TestCoupon>
  retrievePrice: (secret: string, priceId: string) => Promise<TestPrice>
  createSession: (secret: string, params: Stripe.Checkout.SessionCreateParams, options: Stripe.RequestOptions) => Promise<Pick<Stripe.Checkout.Session, "id" | "url">>
}

const defaults: Dependencies = {
  env: process.env,
  uuid: randomUUID,
  adminEmail: async (request, env) => {
    const secret = env.INTERNAL_ADMIN_SECRET?.trim()
    const token = request.cookies.get("ams_internal_admin_access")?.value
    if (!secret || !token) return null
    const session = await verifyInternalAdminCookie(token, secret)
    return session?.email ?? null
  },
  retrieveCoupon: (secret, id) => new Stripe(secret).coupons.retrieve(id),
  retrievePrice: (secret, id) => new Stripe(secret).prices.retrieve(id),
  createSession: (secret, params, options) => new Stripe(secret).checkout.sessions.create(params, options),
}

function noStore(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

function ready(env: NodeJS.ProcessEnv) {
  return env.VERCEL_ENV === "preview" &&
    env.AMS_QUICK_AUDIT_OWNER_PILOT_ENABLED?.trim() === "true" &&
    env.AMS_QUICK_AUDIT_FULFILLMENT_READY?.trim() === "true"
}

/** In preview only; never modifies the public $49 audit checkout or the live Stripe product. */
export function createOwnerPilotCheckoutHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }

  return async function POST(request: NextRequest) {
    const env = dependencies.env
    if (!ready(env)) return noStore({ ok: false, code: "PILOT_DISABLED" }, 404)

    const owner = env.AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL?.trim().toLowerCase()
    const admin = await dependencies.adminEmail(request, env)
    if (!owner || !admin || admin.trim().toLowerCase() !== owner) {
      return noStore({ ok: false, code: "PILOT_NOT_AUTHORIZED" }, 403)
    }

    // Same-origin request plus Vercel's immutable deployment URL: avoid off-domain redirects.
    const deploymentHost = env.VERCEL_URL?.trim().toLowerCase()
    const expectedOrigin = deploymentHost && /^[-a-z0-9.]+\.vercel\.app$/.test(deploymentHost)
      ? `https://${deploymentHost}`
      : null
    if (!expectedOrigin || request.nextUrl.origin !== expectedOrigin ||
      request.headers.get("origin") !== expectedOrigin) {
      return noStore({ ok: false, code: "PILOT_ORIGIN_REJECTED" }, 403)
    }

    const parsed = ownerPilotSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return noStore({ ok: false, code: "PILOT_INTAKE_INVALID" }, 400)
    const auditedSite = new URL(parsed.data.websiteUrl)
    if (auditedSite.protocol !== "https:" || auditedSite.username || auditedSite.password ||
      auditedSite.port || !["aspectmarketingsolutions.app", "www.aspectmarketingsolutions.app"].includes(auditedSite.hostname.toLowerCase())) {
      return noStore({ ok: false, code: "PILOT_AMS_SITE_ONLY" }, 400)
    }

    const secret = env.AMS_STRIPE_QUICK_AUDIT_SECRET_KEY?.trim()
    const priceId = env.AMS_STRIPE_QUICK_AUDIT_PRICE_ID?.trim()
    const couponId = env.AMS_QUICK_AUDIT_OWNER_PILOT_COUPON_ID?.trim()
    if (!secret || !/^(sk|rk)_test_/.test(secret) ||
      !priceId?.startsWith("price_") || !couponId?.startsWith("coupon_")) {
      return noStore({ ok: false, code: "PILOT_STRIPE_NOT_CONFIGURED" }, 503)
    }

    try {
      const [coupon, price] = await Promise.all([
        dependencies.retrieveCoupon(secret, couponId),
        dependencies.retrievePrice(secret, priceId),
      ])
      if (!coupon.valid || coupon.livemode || coupon.amount_off !== PILOT_COUPON_AMOUNT_CENTS ||
        coupon.currency !== "usd" || coupon.duration !== "once" ||
        coupon.max_redemptions !== 1 || coupon.times_redeemed !== 0 ||
        price.id !== priceId || price.livemode || !price.active ||
        price.currency !== "usd" || price.unit_amount !== PUBLIC_AUDIT_PRICE_CENTS ||
        price.type !== "one_time") {
        return noStore({ ok: false, code: "PILOT_PRICE_MISMATCH" }, 409)
      }
      const requestId = `quick-audit-${dependencies.uuid()}`
      const session = await dependencies.createSession(secret, {
        mode: "payment",
        line_items: [{ price: priceId, quantity: 1 }],
        discounts: [{ coupon: couponId }],
        payment_method_types: ["card"],
        success_url: `${expectedOrigin}/quick-marketing-audit/thanks?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${expectedOrigin}/quick-marketing-audit/sample`,
        customer_creation: "always",
        billing_address_collection: "auto",
        automatic_tax: { enabled: false },
        allow_promotion_codes: false,
        metadata: {
          ams_offer: "quick-marketing-audit",
          ams_request_id: requestId,
          ams_business_name: parsed.data.businessName,
          ams_website_url: parsed.data.websiteUrl,
          ams_industry: parsed.data.industry,
          ams_goals: parsed.data.goals,
          ams_notes: parsed.data.notes,
          ams_pilot: "owner-preview-testmode",
        },
      }, { idempotencyKey: requestId })
      if (!session.url || !session.url.startsWith("https://checkout.stripe.com/")) {
        // Stripe's test-mode Checkout uses checkout.stripe.com, not a public AMS payment page.
        return noStore({ ok: false, code: "PILOT_CHECKOUT_URL_UNAVAILABLE" }, 502)
      }
      return noStore({ ok: true, url: session.url, sessionId: session.id, testMode: true, expectedTotalCents: PILOT_TOTAL_CENTS }, 200)
    } catch {
      return noStore({ ok: false, code: "PILOT_CHECKOUT_UNAVAILABLE" }, 503)
    }
  }
}
