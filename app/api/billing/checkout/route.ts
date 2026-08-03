import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

import { authorizePaidApiRequest } from "@/lib/server/customer-api-auth"
import { getEntitlementSnapshot, type PlanSlug } from "@/lib/server/entitlements"
import {
  claimStripeCheckoutIntent,
  completeStripeCheckoutIntent,
  releaseStripeCheckoutIntent,
} from "@/lib/server/stripe-checkout-intents"
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
  getEntitlements: typeof getEntitlementSnapshot
  claimIntent: typeof claimStripeCheckoutIntent
  completeIntent: typeof completeStripeCheckoutIntent
  releaseIntent: typeof releaseStripeCheckoutIntent
  env: NodeJS.ProcessEnv
  now: () => number
  createSession: (
    secretKey: string,
    params: Stripe.Checkout.SessionCreateParams,
    options: Stripe.RequestOptions,
  ) => Promise<Pick<Stripe.Checkout.Session, "id" | "url">>
}

const defaultDependencies: CheckoutDependencies = {
  authorize: authorizePaidApiRequest,
  getEntitlements: getEntitlementSnapshot,
  claimIntent: claimStripeCheckoutIntent,
  completeIntent: completeStripeCheckoutIntent,
  releaseIntent: releaseStripeCheckoutIntent,
  env: process.env,
  now: Date.now,
  createSession: async (secretKey, params, options) => {
    const stripe = new Stripe(secretKey)
    return stripe.checkout.sessions.create(params, options)
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

    const snapshot = await dependencies.getEntitlements(principal.subject).catch(() => null)
    if (!snapshot?.configured) {
      return noStoreJson(
        {
          ok: false,
          error: "Entitlement service is not configured",
          code: "ENTITLEMENTS_NOT_CONFIGURED",
        },
        503,
      )
    }
    if (snapshot.subscriptionStatus === "active" || snapshot.subscriptionStatus === "trialing") {
      return noStoreJson(
        {
          ok: false,
          error: "This account already has subscription access",
          code: "SUBSCRIPTION_ALREADY_ACTIVE",
        },
        409,
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

    let intent: Awaited<ReturnType<typeof claimStripeCheckoutIntent>>
    try {
      intent = await dependencies.claimIntent({
        subject: principal.subject,
        plan,
        priceId: stripePriceId,
        now: dependencies.now(),
      })
    } catch {
      return noStoreJson(
        {
          ok: false,
          error: "Checkout intent storage is unavailable",
          code: "CHECKOUT_INTENT_STORE_UNAVAILABLE",
        },
        503,
      )
    }

    if (intent.state === "active_subscription") {
      return noStoreJson(
        {
          ok: false,
          error: "This account already has subscription access",
          code: "SUBSCRIPTION_ALREADY_ACTIVE",
        },
        409,
      )
    }
    if (intent.state === "conflict") {
      return noStoreJson(
        {
          ok: false,
          error: "Another checkout plan is already open for this account",
          code: "CHECKOUT_INTENT_CONFLICT",
        },
        409,
      )
    }
    if (intent.state === "processing") {
      return NextResponse.json(
        {
          ok: false,
          error: "Checkout creation is already in progress",
          code: "CHECKOUT_IN_PROGRESS",
        },
        {
          status: 409,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(intent.retryAfterSeconds),
          },
        },
      )
    }
    if (intent.state === "open") {
      return NextResponse.json(
        {
          ok: true,
          plan,
          sessionId: intent.sessionId,
          url: intent.url,
          idempotent: true,
        },
        { headers: { "Cache-Control": "no-store" } },
      )
    }

    const metadata = {
      customerSubject: principal.subject,
      userEmail: principal.billingEmail,
      source: "ams-subscription-checkout",
    }

    try {
      const customer = snapshot.stripeCustomerId
        ? { customer: snapshot.stripeCustomerId }
        : { customer_email: principal.billingEmail }
      const session = await dependencies.createSession(stripeSecretKey, {
        mode: "subscription",
        ...customer,
        client_reference_id: principal.subject,
        line_items: [{ price: stripePriceId, quantity: 1 }],
        metadata,
        subscription_data: { metadata },
        success_url: `${publicAppUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${publicAppUrl}/billing`,
        allow_promotion_codes: false,
        billing_address_collection: "auto",
        automatic_tax: { enabled: false },
        expires_at: Math.floor(intent.expiresAt / 1000),
      }, {
        idempotencyKey: intent.idempotencyKey,
      })

      if (!session.url) throw new Error("STRIPE_CHECKOUT_URL_MISSING")

      try {
        await dependencies.completeIntent({
          subject: principal.subject,
          token: intent.token,
          sessionId: session.id,
          url: session.url,
          expiresAt: intent.expiresAt,
          now: dependencies.now(),
        })
      } catch {
        await dependencies.releaseIntent({
          subject: principal.subject,
          token: intent.token,
          now: dependencies.now(),
        }).catch(() => undefined)
        return noStoreJson(
          {
            ok: false,
            error: "Checkout session could not be safely persisted",
            code: "CHECKOUT_INTENT_PERSISTENCE_FAILED",
          },
          503,
        )
      }

      return NextResponse.json(
        { ok: true, plan, sessionId: session.id, url: session.url, idempotent: false },
        { headers: { "Cache-Control": "no-store" } },
      )
    } catch {
      await dependencies.releaseIntent({
        subject: principal.subject,
        token: intent.token,
        now: dependencies.now(),
      }).catch(() => undefined)
      return noStoreJson({ ok: false, error: "Checkout failed" }, 502)
    }
  }
}

export async function POST(request: NextRequest) {
  return createCheckoutHandler(testDependencies())(request)
}
