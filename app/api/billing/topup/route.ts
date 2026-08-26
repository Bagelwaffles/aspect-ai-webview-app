import { createHash } from "node:crypto"

import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

import {
  creditTopupPack,
  isAndroidWebViewUserAgent,
  isCreditTopupPackSlug,
  type CreditTopupPack,
  type CreditTopupPackSlug,
} from "@/lib/credit-topups"
import { authorizePaidApiRequest } from "@/lib/server/customer-api-auth"
import { getEntitlementSnapshot } from "@/lib/server/entitlements"
import {
  assertStripeSecretKeyMatchesMode,
  resolvePublicAppUrl,
} from "@/lib/server/stripe-entitlements"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type TopupCheckoutDependencies = {
  authorize: typeof authorizePaidApiRequest
  getEntitlements: typeof getEntitlementSnapshot
  env: NodeJS.ProcessEnv
  resolvePrice: (secretKey: string, pack: CreditTopupPack) => Promise<Stripe.Price>
  createSession: (
    secretKey: string,
    params: Stripe.Checkout.SessionCreateParams,
    options: Stripe.RequestOptions,
  ) => Promise<Pick<Stripe.Checkout.Session, "id" | "url">>
}

const defaultDependencies: TopupCheckoutDependencies = {
  authorize: authorizePaidApiRequest,
  getEntitlements: getEntitlementSnapshot,
  env: process.env,
  resolvePrice: async (secretKey, pack) => {
    const stripe = new Stripe(secretKey)
    const result = await stripe.prices.list({
      active: true,
      lookup_keys: [pack.lookupKey],
      limit: 2,
    })
    if (result.data.length !== 1) throw new Error("CREDIT_TOPUP_PRICE_NOT_UNIQUE")
    const price = result.data[0]
    if (
      price.lookup_key !== pack.lookupKey ||
      price.type !== "one_time" ||
      price.recurring !== null ||
      price.currency !== "usd" ||
      price.unit_amount !== pack.priceCents ||
      price.metadata?.offer_type !== "credit_topup" ||
      price.metadata?.topup_units !== String(pack.units) ||
      price.metadata?.subscriber_only !== "true"
    ) {
      throw new Error("CREDIT_TOPUP_PRICE_INVALID")
    }
    return price
  },
  createSession: async (secretKey, params, options) => {
    const stripe = new Stripe(secretKey)
    return stripe.checkout.sessions.create(params, options)
  },
}

type TopupCheckoutTestGlobals = typeof globalThis & {
  __amsTopupCheckoutTestDependencies?: Partial<TopupCheckoutDependencies>
}

function testDependencies(): Partial<TopupCheckoutDependencies> {
  if (process.env.NODE_ENV === "production") return {}
  return (globalThis as TopupCheckoutTestGlobals).__amsTopupCheckoutTestDependencies ?? {}
}

function noStoreJson(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

function validRequestId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,80}$/.test(value)
}

function requestedTopup(body: unknown): { pack: CreditTopupPackSlug; requestId: string } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null
  const record = body as Record<string, unknown>
  if (Object.keys(record).some((key) => key !== "pack" && key !== "requestId")) return null
  if (!isCreditTopupPackSlug(record.pack) || !validRequestId(record.requestId)) return null
  return { pack: record.pack, requestId: record.requestId }
}

function checkoutIdempotencyKey(subject: string, pack: CreditTopupPackSlug, requestId: string) {
  const digest = createHash("sha256")
    .update(`${subject}\u0000${pack}\u0000${requestId}`)
    .digest("hex")
  return `ams-topup-checkout-${digest}`
}

export function createCreditTopupCheckoutHandler(
  overrides: Partial<TopupCheckoutDependencies> = {},
) {
  const dependencies = { ...defaultDependencies, ...overrides }

  return async function topupCheckoutPost(request: NextRequest) {
    if (isAndroidWebViewUserAgent(request.headers.get("user-agent"))) {
      return noStoreJson(
        {
          ok: false,
          error: "Credit purchases are not available inside this Android app billing surface.",
          code: "CREDIT_TOPUP_UNAVAILABLE_IN_PLAY_WEBVIEW",
        },
        403,
      )
    }

    const principal = await dependencies.authorize(request)
    if (!principal || principal.kind !== "customer") {
      return noStoreJson(
        { ok: false, error: "A customer session is required", code: "CUSTOMER_SESSION_REQUIRED" },
        401,
      )
    }

    const requested = requestedTopup(await request.json().catch(() => null))
    if (!requested) {
      return noStoreJson(
        { ok: false, error: "Unknown or unsupported credit top-up", code: "INVALID_CREDIT_TOPUP_REQUEST" },
        400,
      )
    }

    const snapshot = await dependencies.getEntitlements(principal.subject).catch(() => null)
    if (!snapshot?.configured) {
      return noStoreJson(
        { ok: false, error: "Entitlement service is not configured", code: "ENTITLEMENTS_NOT_CONFIGURED" },
        503,
      )
    }
    if (snapshot.subscriptionStatus !== "active" && snapshot.subscriptionStatus !== "trialing") {
      return noStoreJson(
        {
          ok: false,
          error: "Credit top-ups require an active AMS subscription",
          code: "ACTIVE_SUBSCRIPTION_REQUIRED",
        },
        403,
      )
    }

    const pack = creditTopupPack(requested.pack)
    const stripeSecretKey = dependencies.env.STRIPE_SECRET_KEY?.trim()
    let publicAppUrl: string
    if (!stripeSecretKey) {
      return noStoreJson(
        { ok: false, error: "Credit top-up checkout is not configured", code: "CREDIT_TOPUP_NOT_CONFIGURED" },
        503,
      )
    }

    try {
      assertStripeSecretKeyMatchesMode(stripeSecretKey, dependencies.env)
      publicAppUrl = resolvePublicAppUrl({
        env: dependencies.env,
        requestOrigin: request.nextUrl.origin,
      })
    } catch {
      return noStoreJson(
        { ok: false, error: "Credit top-up checkout is not configured", code: "CREDIT_TOPUP_NOT_CONFIGURED" },
        503,
      )
    }

    let price: Stripe.Price
    try {
      price = await dependencies.resolvePrice(stripeSecretKey, pack)
    } catch {
      return noStoreJson(
        { ok: false, error: "Credit top-up price is unavailable", code: "CREDIT_TOPUP_PRICE_UNAVAILABLE" },
        503,
      )
    }

    const metadata = {
      ams_offer: "credit-topup",
      customerSubject: principal.subject,
      userEmail: principal.billingEmail,
      topupPack: pack.slug,
      topupUnits: String(pack.units),
      priceLookupKey: pack.lookupKey,
    }

    try {
      const customer = snapshot.stripeCustomerId
        ? { customer: snapshot.stripeCustomerId }
        : { customer_email: principal.billingEmail }
      const session = await dependencies.createSession(
        stripeSecretKey,
        {
          mode: "payment",
          payment_method_types: ["card"],
          ...customer,
          client_reference_id: principal.subject,
          line_items: [{ price: price.id, quantity: 1 }],
          metadata,
          payment_intent_data: { metadata },
          success_url: `${publicAppUrl}/billing/topup/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${publicAppUrl}/billing`,
          allow_promotion_codes: false,
          billing_address_collection: "auto",
          automatic_tax: { enabled: false },
        },
        {
          idempotencyKey: checkoutIdempotencyKey(
            principal.subject,
            pack.slug,
            requested.requestId,
          ),
        },
      )

      if (!session.url) throw new Error("STRIPE_CHECKOUT_URL_MISSING")

      return NextResponse.json(
        {
          ok: true,
          pack: pack.slug,
          units: pack.units,
          sessionId: session.id,
          url: session.url,
        },
        { headers: { "Cache-Control": "no-store" } },
      )
    } catch {
      return noStoreJson({ ok: false, error: "Credit top-up checkout failed" }, 502)
    }
  }
}

export async function POST(request: NextRequest) {
  return createCreditTopupCheckoutHandler(testDependencies())(request)
}
