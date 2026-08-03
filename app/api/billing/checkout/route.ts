import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

import { authorizePaidApiRequest } from "@/lib/server/customer-api-auth"
import type { PlanSlug } from "@/lib/server/entitlements"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PRICE_ENV: Record<PlanSlug, string> = {
  starter: "AMS_STRIPE_STARTER_PRICE_ID",
  growth: "AMS_STRIPE_GROWTH_PRICE_ID",
  pro: "AMS_STRIPE_PRO_PRICE_ID",
}

function isPlanSlug(value: unknown): value is PlanSlug {
  return value === "starter" || value === "growth" || value === "pro"
}

export async function POST(request: NextRequest) {
  const principal = await authorizePaidApiRequest(request)
  if (!principal) {
    return NextResponse.json(
      { ok: false, error: "Authentication required", code: "CUSTOMER_AUTH_REQUIRED" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    )
  }

  const body = await request.json().catch(() => null)
  const plan = body && typeof body === "object" ? body.plan : undefined
  if (!isPlanSlug(plan)) {
    return NextResponse.json({ ok: false, error: "Unknown billing plan" }, { status: 400 })
  }

  const email =
    principal.kind === "customer"
      ? principal.email
      : process.env.AMS_DEFAULT_USER_EMAIL?.trim().toLowerCase()

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim()
  const stripePriceId = process.env[PRICE_ENV[plan]]?.trim()

  if (!email || !stripeSecretKey || !stripePriceId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Subscription checkout is not configured",
        code: "SUBSCRIPTION_CHECKOUT_NOT_CONFIGURED",
      },
      { status: 503 },
    )
  }

  try {
    const stripe = new Stripe(stripeSecretKey)
    const baseUrl = request.nextUrl.origin
    const metadata = {
      userEmail: email,
      plan,
      source: "ams-subscription-checkout",
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email,
      client_reference_id: email,
      line_items: [{ price: stripePriceId, quantity: 1 }],
      metadata,
      subscription_data: { metadata },
      success_url: new URL("/billing/success?session_id={CHECKOUT_SESSION_ID}", baseUrl).toString(),
      cancel_url: new URL("/billing", baseUrl).toString(),
      allow_promotion_codes: false,
      billing_address_collection: "auto",
      automatic_tax: { enabled: false },
    })

    return NextResponse.json(
      { ok: true, plan, sessionId: session.id, url: session.url },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch {
    return NextResponse.json({ ok: false, error: "Checkout failed" }, { status: 502 })
  }
}
