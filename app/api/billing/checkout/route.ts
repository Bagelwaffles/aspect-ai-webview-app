import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

import {
  isInternalApiAuthorized,
  unauthorizedInternalApiResponse,
} from "@/lib/server/internal-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  if (!isInternalApiAuthorized(request)) {
    return unauthorizedInternalApiResponse()
  }

  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim()
    const stripePriceId = process.env.STRIPE_PRICE_ID?.trim()
    const organizationId = process.env.AMS_DEFAULT_ORGANIZATION_ID?.trim()
    const userId = process.env.AMS_DEFAULT_USER_ID?.trim()

    if (!stripeSecretKey || !stripePriceId || !organizationId || !userId) {
      return NextResponse.json(
        {
          error: "Authenticated subscription checkout is not configured",
          code: "SUBSCRIPTION_CHECKOUT_NOT_CONFIGURED",
        },
        { status: 503 },
      )
    }

    const stripe = new Stripe(stripeSecretKey)
    const baseUrl = request.nextUrl.origin

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      client_reference_id: organizationId,
      line_items: [{ price: stripePriceId, quantity: 1 }],
      metadata: {
        organizationId,
        userId,
        source: "ams-internal-subscription-checkout",
      },
      subscription_data: {
        metadata: {
          organizationId,
          userId,
          source: "ams-internal-subscription-checkout",
        },
        trial_period_days: 14,
      },
      success_url: new URL("/billing/success", baseUrl).toString(),
      cancel_url: new URL("/billing", baseUrl).toString(),
      allow_promotion_codes: false,
      billing_address_collection: "auto",
      automatic_tax: { enabled: false },
    })

    return NextResponse.json({ ok: true, sessionId: session.id, url: session.url })
  } catch {
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 })
  }
}
