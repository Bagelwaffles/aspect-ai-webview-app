import { createHash } from "node:crypto"

import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { Redis } from "@upstash/redis"

import {
  creditTopupPack,
  isAndroidWebViewUserAgent,
  isCreditTopupPackSlug,
  type CreditTopupPack,
  type CreditTopupPackSlug,
} from "../credit-topups"
import { authorizePaidApiRequest } from "./customer-api-auth"
import { getEntitlementSnapshot } from "./entitlements"
import {
  assertStripeSecretKeyMatchesMode,
  resolvePublicAppUrl,
} from "./stripe-entitlements"

type CheckoutRateLimitResult = {
  allowed: boolean
  retryAfterSeconds: number
}

type TopupCheckoutDependencies = {
  authorize: typeof authorizePaidApiRequest
  getEntitlements: typeof getEntitlementSnapshot
  env: NodeJS.ProcessEnv
  checkRateLimit: (subject: string) => Promise<CheckoutRateLimitResult>
  resolvePrice: (secretKey: string, pack: CreditTopupPack) => Promise<Stripe.Price>
  createSession: (
    secretKey: string,
    params: Stripe.Checkout.SessionCreateParams,
    options: Stripe.RequestOptions,
  ) => Promise<Pick<Stripe.Checkout.Session, "id" | "url">>
}

const CHECKOUT_RATE_LIMIT_MAX = 5
const CHECKOUT_RATE_LIMIT_SECONDS = 10 * 60
let rateLimitRedis: Redis | null | undefined

function getRateLimitRedis(): Redis | null {
  if (rateLimitRedis !== undefined) return rateLimitRedis
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)?.trim()
  rateLimitRedis = url && token ? new Redis({ url, token }) : null
  return rateLimitRedis
}

async function distributedCheckoutRateLimit(subject: string): Promise<CheckoutRateLimitResult> {
  const redis = getRateLimitRedis()
  if (!redis) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CREDIT_TOPUP_RATE_LIMIT_STORE_NOT_CONFIGURED")
    }
    return { allowed: true, retryAfterSeconds: 0 }
  }

  const subjectHash = createHash("sha256").update(subject).digest("hex")
  const key = `ams:rate-limit:credit-topup-checkout:${subjectHash}`
  const script = `
    local count = redis.call('INCR', KEYS[1])
    if count == 1 then
      redis.call('EXPIRE', KEYS[1], ARGV[1])
    end
    local ttl = redis.call('TTL', KEYS[1])
    if ttl < 1 then ttl = tonumber(ARGV[1]) end
    return {tostring(count), tostring(ttl)}
  `
  const raw = await redis.eval(script, [key], [CHECKOUT_RATE_LIMIT_SECONDS])
  if (!Array.isArray(raw)) throw new Error("CREDIT_TOPUP_RATE_LIMIT_INVALID_RESPONSE")
  const count = Number.parseInt(String(raw[0] ?? ""), 10)
  const ttl = Number.parseInt(String(raw[1] ?? ""), 10)
  if (!Number.isSafeInteger(count) || !Number.isSafeInteger(ttl) || count < 1 || ttl < 0) {
    throw new Error("CREDIT_TOPUP_RATE_LIMIT_INVALID_RESPONSE")
  }

  return {
    allowed: count <= CHECKOUT_RATE_LIMIT_MAX,
    retryAfterSeconds: Math.max(1, ttl),
  }
}

function expandedProduct(price: Stripe.Price): Stripe.Product | null {
  const product = price.product
  if (!product || typeof product === "string") return null
  if ("deleted" in product && product.deleted) return null
  return product as Stripe.Product
}

const defaultDependencies: TopupCheckoutDependencies = {
  authorize: authorizePaidApiRequest,
  getEntitlements: getEntitlementSnapshot,
  env: process.env,
  checkRateLimit: distributedCheckoutRateLimit,
  resolvePrice: async (secretKey, pack) => {
    const stripe = new Stripe(secretKey)
    const result = await stripe.prices.list({
      active: true,
      lookup_keys: [pack.lookupKey],
      limit: 2,
      expand: ["data.product"],
    })
    if (result.data.length !== 1) throw new Error("CREDIT_TOPUP_PRICE_NOT_UNIQUE")
    const price = result.data[0]
    const product = expandedProduct(price)
    if (
      price.lookup_key !== pack.lookupKey ||
      price.type !== "one_time" ||
      price.recurring !== null ||
      price.currency !== "usd" ||
      price.unit_amount !== pack.priceCents ||
      price.metadata?.offer_type !== "credit_topup" ||
      price.metadata?.topup_units !== String(pack.units) ||
      price.metadata?.subscriber_only !== "true" ||
      price.metadata?.non_expiring !== "true" ||
      !product ||
      product.active !== true ||
      product.metadata?.offer_type !== "credit_topup" ||
      product.metadata?.topup_units !== String(pack.units) ||
      product.metadata?.subscriber_only !== "true" ||
      product.metadata?.non_expiring !== "true" ||
      product.metadata?.checkout_enabled !== "true"
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

function noStoreJson(body: Record<string, unknown>, status: number, headers?: Record<string, string>) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  })
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

    let rateLimit: CheckoutRateLimitResult
    try {
      rateLimit = await dependencies.checkRateLimit(principal.subject)
    } catch {
      return noStoreJson(
        {
          ok: false,
          error: "Credit top-up checkout is temporarily unavailable",
          code: "CREDIT_TOPUP_RATE_LIMIT_UNAVAILABLE",
        },
        503,
      )
    }
    if (!rateLimit.allowed) {
      return noStoreJson(
        {
          ok: false,
          error: "Too many credit checkout attempts. Try again shortly.",
          code: "CREDIT_TOPUP_RATE_LIMITED",
        },
        429,
        { "Retry-After": String(rateLimit.retryAfterSeconds) },
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
        {
          ok: false,
          error: "Credit top-up purchases are not enabled yet",
          code: "CREDIT_TOPUP_PRICE_UNAVAILABLE",
        },
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
          expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
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
