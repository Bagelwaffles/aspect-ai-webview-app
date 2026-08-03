import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

import { authorizePaidApiRequest } from "@/lib/server/customer-api-auth"
import type { PlanSlug } from "@/lib/server/entitlements"
import {
  assertStripeSecretKeyMatchesMode,
  resolvePublicAppUrl,
} from "@/lib/server/stripe-entitlements"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PRICE_ENV: Record<PlanSlug, string> = {
  starter: "AMS_STRIPE_STARTER_PRICE_ID",
  growth: "AMS_STRIPE_GROWTH_PRICE_ID",
  pro: "AMS_STRIPE_PRO_PRICE_ID",
}

type CheckoutDependencies = {
  authorize: typeof authorizePaidApiRequest
  env: NodeJS.ProcessEnv
  createSession: (
    secretKey: string,
    params: Stripe.Checkout.SessionCreateParams,
  ) => Promise<Pick<Stripe.Checkout.Session, "id" | "url">>
}

const defaultDependencies: CheckoutDependencies = {
  authorize: authorizePaidApiRequest,
  env: process.env,
  createSession: async (secretKey, params) => {
    const stripe = new Stripe(secretKey)
    return stripe.checkout.sessions.create(params)
  },
}

type CheckoutTestGlobals = typeof globalThis & {
  __amsCheckoutTestDependencies?: Partial<CheckoutDependencies>
}

function testDependencies(): Partial<CheckoutDependencies> {
  if (process.env.NODE_ENV === "production") return {}
  return (globalThis as CheckoutTestGlobals).__amsCheckoutTestDependencies ?? {}
}

function isPlanSlug(value: unknown): value is PlanSlug {
  return value === "starter" || value === "growth" || value === "pro"
}

function requestedPlan(body: unknown): PlanSlug | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null
  const record = body as Record<string, unknown>
  if (Object.keys(record).some((key) => key !== "plan")) return null
  return isPlanSlug(record.plan) ? record.plan : null
}

function noStoreJson(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

function createCheckoutHandler(overrides: Partial<CheckoutDependencies> = {}) {
  const dependencies = { ...defaultDependencies, ...overrides }

  return async function checkoutPost(request: NextRequest) {
    const principal = await dependencies.authorize(request)
    if (!principal || principal.kind !== "customer") {
      return noStoreJson(
        { ok: false, error: "A customer session is required", code: "CUSTOMER_SESSION_REQUIRED" },
        401,
      )
    }

    const plan = requestedPlan(await request.json().catch(() => null))
    if (!plan) {
      return noStoreJson(
        { ok: false, error: "Unknown or unsupported billing request", code: "INVALID_CHECKOUT_REQUEST" },
        400,
      )
    }

    const stripeSecretKey = dependencies.env.STRIPE_SECRET_KEY?.trim()
    const stripePriceId = dependencies.env[PRICE_ENV[plan]]?.trim()
    let publicAppUrl: string
    try {
      if (!stripeSecretKey || !stripePriceId) throw new Error("CHECKOUT_CONFIGURATION_MISSING")
      assertStripeSecretKeyMatchesMode(stripeSecretKey, dependencies.env)
      publicAppUrl = resolvePublicAppUrl({
        env: dependencies.env,
        requestOrigin: request.nextUrl.origin,
      })
    } catch {
      return noStoreJson(
        {
          ok: false,
          error: "Subscription checkout is not configured",
          code: "SUBSCRIPTION_CHECKOUT_NOT_CONFIGURED",
        },
        503,
      )
    }

    const metadata = {
      customerSubject: principal.subject,
      userEmail: principal.billingEmail,
      source: "ams-subscription-checkout",
    }

    try {
      const session = await dependencies.createSession(stripeSecretKey, {
        mode: "subscription",
        customer_email: principal.billingEmail,
        client_reference_id: principal.subject,
        line_items: [{ price: stripePriceId, quantity: 1 }],
        metadata,
        subscription_data: { metadata },
        success_url: `${publicAppUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${publicAppUrl}/billing`,
        allow_promotion_codes: false,
        billing_address_collection: "auto",
        automatic_tax: { enabled: false },
      })

      return NextResponse.json(
        { ok: true, plan, sessionId: session.id, url: session.url },
        { headers: { "Cache-Control": "no-store" } },
      )
    } catch {
      return noStoreJson({ ok: false, error: "Checkout failed" }, 502)
    }
  }
}

export async function POST(request: NextRequest) {
  return createCheckoutHandler(testDependencies())(request)
}
