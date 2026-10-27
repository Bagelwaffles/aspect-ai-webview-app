import { randomUUID } from "node:crypto"

import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

import { verifyInternalAdminCookie } from "@/app/lib/internal-admin-cookie"
import { resolvePublicAppUrl } from "./stripe-entitlements"

const PILOT_ACCOUNT_ID = "acct_1Smr2bGloGM6sjzB"
const PILOT_PRODUCT_ID = "prod_V4G6IWGLJGKtun"
const PILOT_PRICE_ID = "price_1U47ZwGloGM6sjzB3awn1s2A"
const PILOT_COUPON_ID = "coupon_ams_owner_audit_pilot_20261021"
const PILOT_BRANCH = "feat/audit-delivery-security-preview-20261023"

type PilotSessionReadback = {
  id: string
  livemode: boolean
  amount_subtotal: number | null
  amount_total: number | null
  amount_discount: number | null
  currency: string | null
  payment_status: "paid" | "unpaid" | "no_payment_required"
}

// The exact existing, unused main-account coupon must match every field.
export function matchesOwnerPilotFixtures(
  accountId: string,
  price: Pick<Stripe.Price, "id" | "active" | "currency" | "unit_amount" | "type" | "product">,
  coupon: Pick<Stripe.Coupon, "id" | "valid" | "amount_off" | "currency" | "duration" | "times_redeemed" | "max_redemptions" | "applies_to">,
) {
  return (
    accountId === PILOT_ACCOUNT_ID &&
    price.id === PILOT_PRICE_ID &&
    price.active === true &&
    price.currency === "usd" &&
    price.unit_amount === 4900 &&
    price.type === "one_time" &&
    price.product === PILOT_PRODUCT_ID &&
    coupon.id === PILOT_COUPON_ID &&
    coupon.valid === true &&
    coupon.currency === "usd" &&
    coupon.amount_off === 4400 &&
    coupon.duration === "once" &&
    coupon.times_redeemed === 0 &&
    coupon.max_redemptions === 1 &&
    coupon.applies_to?.products?.includes(PILOT_PRODUCT_ID) === true
  )
}

type Dependencies = {
  env: NodeJS.ProcessEnv
  idFactory: () => string
  verifyPilotConfiguration: (secretKey: string, priceId: string, couponId: string) => Promise<boolean>
  retrievePilotSession: (secretKey: string, sessionId: string) => Promise<PilotSessionReadback>
  verifyAdminCookie: (token: string | undefined, secret: string) => Promise<{ email?: string } | null>
  createSession: (
    secretKey: string,
    params: Stripe.Checkout.SessionCreateParams,
    options: Stripe.RequestOptions,
  ) => Promise<Pick<Stripe.Checkout.Session, "id" | "url" | "livemode">>
}

const defaults: Dependencies = {
  env: process.env,
  idFactory: randomUUID,
  verifyPilotConfiguration: async (secretKey, priceId, couponId) => {
    const stripe = new Stripe(secretKey)
    const [account, price, coupon] = await Promise.all([
      stripe.accounts.retrieve(),
      stripe.prices.retrieve(priceId),
      stripe.coupons.retrieve(couponId),
    ])
    return matchesOwnerPilotFixtures(account.id, price, coupon)
  },
  retrievePilotSession: async (secretKey, sessionId) => {
    const session = await new Stripe(secretKey).checkout.sessions.retrieve(sessionId)
    return {
      id: session.id,
      livemode: session.livemode,
      amount_subtotal: session.amount_subtotal,
      amount_total: session.amount_total,
      amount_discount: session.total_details?.amount_discount ?? null,
      currency: session.currency,
      payment_status: session.payment_status,
    }
  },
  verifyAdminCookie: verifyInternalAdminCookie,
  createSession: async (secretKey, params, options) =>
    new Stripe(secretKey).checkout.sessions.create(params, options),
}

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

async function isAuthorized(request: NextRequest, dependencies: Dependencies) {
  const expectedSecret = dependencies.env.INTERNAL_ADMIN_SECRET?.trim()
  if (!expectedSecret) return false
  const token = request.cookies.get("ams_internal_admin_access")?.value
  const session = await dependencies.verifyAdminCookie(token, expectedSecret)
  return Boolean(session?.email)
}


// Operational attestations intentionally default OFF; they never substitute
// for independently verified same-account webhook, Redis, fulfillment and replay.
function ownerPilotReady(env: NodeJS.ProcessEnv, priceId: string, requestOrigin: string, publicUrl: string) {
  return (
    env.VERCEL_ENV === "preview" &&
    env.VERCEL_GIT_COMMIT_REF === PILOT_BRANCH &&
    requestOrigin.startsWith("https://") &&
    requestOrigin.endsWith(".vercel.app") &&
    publicUrl === requestOrigin &&
    env.AMS_STRIPE_QUICK_AUDIT_PRICE_ID === PILOT_PRICE_ID &&
    priceId === PILOT_PRICE_ID &&
    env.AMS_QUICK_AUDIT_OWNER_PILOT_COUPON_ID === PILOT_COUPON_ID &&
    env.AMS_QUICK_AUDIT_OWNER_PILOT_ENABLED === "true" &&
    env.AMS_QUICK_AUDIT_OWNER_PILOT_WEBHOOK_VERIFIED === "true" &&
    env.AMS_QUICK_AUDIT_OWNER_PILOT_REDIS_VERIFIED === "true" &&
    env.AMS_QUICK_AUDIT_OWNER_PILOT_FULFILLMENT_VERIFIED === "true" &&
    env.AMS_STRIPE_WEBHOOK_MODE === "test" &&
    env.AMS_QUICK_AUDIT_PUBLIC_SALES_ENABLED !== "true" &&
    env.AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED !== "true" &&
    env.AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED !== "true" &&
    env.AMS_SUBSCRIPTION_CHECKOUT_ENABLED !== "true"
  )
}

export function createQuickAuditTestCheckoutHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }

  return async function POST(request: NextRequest) {
    if (!(await isAuthorized(request, dependencies))) {
      return noStoreJson(
        { ok: false, error: "Internal admin authentication required", code: "QUICK_AUDIT_TEST_UNAUTHORIZED" },
        401,
      )
    }

    const payload: unknown = await request.json().catch(() => null)
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return noStoreJson({ ok: false, error: "Invalid test request", code: "QUICK_AUDIT_TEST_INVALID_REQUEST" }, 400)
    }
    const pilot = (payload as { pilot?: unknown }).pilot
    if (pilot !== undefined && pilot !== "owner-five-dollar") {
      return noStoreJson({ ok: false, error: "Unknown test operation", code: "QUICK_AUDIT_TEST_INVALID_REQUEST" }, 400)
    }
    const ownerPilot = pilot === "owner-five-dollar"

    const secretKey = dependencies.env.AMS_STRIPE_QUICK_AUDIT_SECRET_KEY?.trim()
    const priceId = dependencies.env.AMS_STRIPE_QUICK_AUDIT_PRICE_ID?.trim()
    if (!secretKey || !/^(sk|rk)_test_/.test(secretKey) || !priceId?.startsWith("price_")) {
      return noStoreJson(
        { ok: false, error: "Stripe test configuration is unavailable", code: "QUICK_AUDIT_TEST_UNCONFIGURED" },
        503,
      )
    }

    const publicUrl = resolvePublicAppUrl({ env: dependencies.env, requestOrigin: request.nextUrl.origin })
    if (ownerPilot) {
      const couponId = dependencies.env.AMS_QUICK_AUDIT_OWNER_PILOT_COUPON_ID?.trim()
      if (!ownerPilotReady(dependencies.env, priceId, request.nextUrl.origin, publicUrl) ||
          couponId !== PILOT_COUPON_ID) {
        return noStoreJson({ ok: false, error: "Owner $5 pilot is not ready", code: "QUICK_AUDIT_OWNER_PILOT_DISABLED" }, 503)
      }
      let verified = false
      try {
        verified = await dependencies.verifyPilotConfiguration(secretKey, priceId, couponId)
      } catch {
        // Absent API scope or unavailable Price/Coupon must fail closed.
      }
      if (!verified) {
        return noStoreJson({ ok: false, error: "Stripe pilot account, Price or coupon did not verify", code: "QUICK_AUDIT_OWNER_PILOT_UNVERIFIED" }, 503)
      }
    }

    const requestId = ownerPilot ? "quick-audit-owner-five-dollar-20261026" : `quick-audit-e2e-${dependencies.idFactory()}`

    try {
      const session = await dependencies.createSession(
        secretKey,
        {
          mode: "payment",
          payment_method_types: ["card"],
          line_items: [{ price: priceId, quantity: 1 }],
          ...(ownerPilot ? { discounts: [{ coupon: PILOT_COUPON_ID }] } : {}),
          success_url: `${publicUrl}/quick-marketing-audit/thanks?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${publicUrl}/dashboard/quick-audit-test`,
          customer_creation: "always",
          customer_email: "quick-audit-e2e@example.com",
          billing_address_collection: "auto",
          automatic_tax: { enabled: false },
          allow_promotion_codes: false,
          metadata: {
            ams_offer: "quick-marketing-audit",
            ams_request_id: requestId,
            ams_business_name: "Aspect Marketing Solutions E2E Fixture",
            ams_website_url: "https://www.aspectmarketingsolutions.app",
            ams_industry: "Marketing automation",
            ams_goals: "Verify the native Quick Audit fulfillment path end to end",
            ams_notes: "Controlled Stripe test-mode E2E. No customer data.",
            ams_environment: ownerPilot ? "test-five-dollar-pilot" : "test-e2e",
          },
        },
        { idempotencyKey: requestId },
      )

      if (session.livemode || !session.id.startsWith("cs_test_") || !session.url) {
        return noStoreJson(
          { ok: false, error: "Stripe did not return a safe test Checkout Session", code: "QUICK_AUDIT_TEST_MODE_MISMATCH" },
          502,
        )
      }

      if (ownerPilot) {
        // Stripe read-back: do not expose a payment URL until exact $5
        // subtotal, applied coupon, currency and unpaid test mode agree.
        const confirmed = await dependencies.retrievePilotSession(secretKey, session.id)
        if (confirmed.id !== session.id || confirmed.livemode ||
            confirmed.amount_subtotal !== 4900 || confirmed.amount_discount !== 4400 ||
            confirmed.amount_total !== 500 || confirmed.currency !== "usd" ||
            confirmed.payment_status !== "unpaid") {
          return noStoreJson({ ok: false, error: "Stripe did not verify the exact $5 test total", code: "QUICK_AUDIT_OWNER_PILOT_TOTAL_MISMATCH" }, 502)
        }
      }

      return noStoreJson({ ok: true, sessionId: session.id, url: session.url, ...(ownerPilot ? { verifiedTestTotalCents: 500 } : {}) })
    } catch {
      return noStoreJson(
        { ok: false, error: "Stripe test Checkout Session could not be created", code: "QUICK_AUDIT_TEST_CHECKOUT_FAILED" },
        502,
      )
    }
  }
}
