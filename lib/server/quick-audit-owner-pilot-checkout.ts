/**
 * One owner-only, TEST-only checkout preparation route for the EXISTING isolated
 * AMS Stripe audit pilot. This creates a Stripe TEST Checkout Session ONLY after
 * a short, separately approved Preview window is armed. It does not pay, ingest,
 * fulfill, send, authorize a live charge or expose credentials.
 *
 * Its fixed audit metadata matches the already-built isolated fulfillment worker.
 * No arbitrary recipient, price, business details or account can be supplied.
 */
import { createHash } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

import { authorizeOwnerApiRequest } from "./owner-api-auth"
import { AMS_PILOT_STRIPE_ACCOUNT, pilotFulfillmentConfiguration } from "./quick-audit-isolated-stripe-pilot"

const CONFIRMATION = "CREATE_ONE_STRIPE_TEST_CHECKOUT"
type CheckoutStripe = Pick<Stripe, "accounts" | "prices" | "checkout">
type Deps = {
  env: NodeJS.ProcessEnv
  now: () => number
  authorize: (request: NextRequest) => Promise<boolean>
  makeStripe: (key: string) => CheckoutStripe
}

const defaults: Deps = {
  env: process.env,
  now: Date.now,
  authorize: async request => (await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })).ok,
  makeStripe: key => new Stripe(key),
}

function json(code: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: status === 200, code, paymentPerformed: false, emailSent: false, ...extra },
    { status, headers: { "Cache-Control": "no-store" } })
}

function previewOrigin(env: NodeJS.ProcessEnv): string | null {
  try {
    const a = new URL(env.PUBLIC_APP_URL ?? "")
    if (a.protocol !== "https:" || !a.hostname.endsWith(".vercel.app") ||
        !a.hostname.startsWith("aspect-ai-overlord-") || a.port || a.username ||
        a.password || a.pathname !== "/" || a.search || a.hash) return null
    const auth = new URL(env.NEXTAUTH_URL ?? "")
    if (auth.origin !== a.origin || auth.pathname !== "/" || auth.search || auth.hash) return null
    return a.origin
  } catch { return null }
}

export function ownerPilotCheckoutReadiness(env: NodeJS.ProcessEnv, now: number) {
  const runId = env.AMS_STRIPE_PILOT_CHECKOUT_RUN_ID?.trim() ?? ""
  const expiry = Date.parse(env.AMS_STRIPE_PILOT_CHECKOUT_UNTIL ?? "")
  const owner = env.AMS_OWNER_EMAIL?.trim().toLowerCase()
  const recipient = env.AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL?.trim().toLowerCase()
  return pilotFulfillmentConfiguration(env).ready &&
    env.AMS_STRIPE_PILOT_CHECKOUT_ENABLED === "true" &&
    env.AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED === "true" &&
    /^[A-Za-z0-9_-]{16,80}$/.test(runId) &&
    Number.isFinite(expiry) && expiry > now && expiry - now <= 10 * 60_000 &&
    Boolean(owner && recipient && recipient === owner) &&
    Boolean(previewOrigin(env)) &&
    env.AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED !== "true" &&
    env.AMS_QUICK_AUDIT_PILOT_DISPATCH_ENABLED !== "true" &&
    env.AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED !== "true"
}

export function createOwnerPilotTestCheckoutHandler(overrides: Partial<Deps> = {}) {
  const dependencies = { ...defaults, ...overrides }
  return async function ownerPilotTestCheckout(request: NextRequest) {
    if (!(await dependencies.authorize(request))) return json("PILOT_OWNER_REQUIRED", 401)
    const env = dependencies.env
    if (!ownerPilotCheckoutReadiness(env, dependencies.now())) return json("PILOT_CHECKOUT_CLOSED", 503)

    const body = await request.text().catch(() => "")
    if (body.length > 128 || !body) return json("PILOT_CHECKOUT_CONFIRMATION_REQUIRED", 400)
    let verified = false
    try {
      const parsed: unknown = JSON.parse(body)
      verified = Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed) &&
        Object.keys(parsed).length === 1 &&
        (parsed as Record<string, unknown>).confirm === CONFIRMATION)
    } catch {}
    if (!verified) return json("PILOT_CHECKOUT_CONFIRMATION_REQUIRED", 400)

    const runId = env.AMS_STRIPE_PILOT_CHECKOUT_RUN_ID!.trim()
    const digest = createHash("sha256").update(AMS_PILOT_STRIPE_ACCOUNT + ":" + runId).digest("hex")
    const requestId = "quick-audit-" + digest.slice(0, 32)
    const owner = env.AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL!.trim().toLowerCase()
    const priceId = env.AMS_STRIPE_PILOT_PRICE_ID!
    const origin = previewOrigin(env)!
    try {
      const stripe = dependencies.makeStripe(env.AMS_STRIPE_PILOT_TEST_SECRET_KEY!)
      const account = await stripe.accounts.retrieve()
      if (account.id !== AMS_PILOT_STRIPE_ACCOUNT) return json("PILOT_ACCOUNT_MISMATCH", 503)

      const price = await stripe.prices.retrieve(priceId)
      if (price.id !== priceId || price.livemode !== false ||
          price.active !== true || price.currency !== "usd" ||
          price.type !== "one_time" || price.recurring !== null ||
          price.unit_amount !== 4900) return json("PILOT_PRICE_MISMATCH", 503)

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        customer_email: owner,
        customer_creation: "always",
        allow_promotion_codes: false,
        automatic_tax: { enabled: false },
        success_url: origin + "/quick-marketing-audit/thanks?session_id={CHECKOUT_SESSION_ID}",
        cancel_url: origin + "/owner/resend-preview",
        metadata: {
          ams_offer: "quick-marketing-audit",
          ams_request_id: requestId,
          ams_business_name: "Aspect Marketing Solutions",
          ams_website_url: "https://www.aspectmarketingsolutions.app",
          ams_industry: "Marketing automation",
          ams_goals: "Check real paid TEST fulfillment and branded owner-only report delivery",
          ams_notes: "Owner-authorized isolated sandbox checkout acceptance; no live customer",
          ams_environment: "isolated-preview-owner-test",
        },
      }, { idempotencyKey: "ams-pilot-checkout-" + digest })
      if (session.livemode !== false || !/^cs_test_[A-Za-z0-9]{8,200}$/.test(session.id) ||
          typeof session.url !== "string" || !session.url.startsWith("https://checkout.stripe.com/")) {
        return json("PILOT_SESSION_MODE_MISMATCH", 503)
      }
      return json("PILOT_TEST_CHECKOUT_CREATED", 200, { sessionId: session.id, url: session.url })
    } catch {
      // Never leak provider messages, keys, URL or customer details on error.
      return json("PILOT_CHECKOUT_PROVIDER_UNAVAILABLE", 503)
    }
  }
}
