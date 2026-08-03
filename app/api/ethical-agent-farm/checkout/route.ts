import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

import {
  getEthicalAgentFarmCheckoutFallbackPath,
  getEthicalAgentFarmCheckoutOffer,
  getEthicalAgentFarmCheckoutPriceId,
  getEthicalAgentFarmCheckoutSuccessPath,
} from "@/lib/ethical-agent-farm-checkout"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

export async function POST(request: NextRequest) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim()
    if (!stripeSecretKey) {
      return NextResponse.json({ ok: false, error: "Checkout not configured" }, { status: 503 })
    }

    const body = await request.json().catch(() => null)
    const offerSlug = normalize(body?.offer)
    const offer = getEthicalAgentFarmCheckoutOffer(offerSlug)

    if (!offer) {
      return NextResponse.json({ ok: false, error: "Unknown offer" }, { status: 400 })
    }

    const priceId = getEthicalAgentFarmCheckoutPriceId(offerSlug)
    if (!priceId) {
      const fallbackPath = getEthicalAgentFarmCheckoutFallbackPath(offerSlug)
      return NextResponse.json(
        {
          ok: false,
          checkoutConfigured: false,
          error: "Offer checkout not configured",
          fallbackPath,
          requestPath: fallbackPath,
        },
        { status: 503 },
      )
    }

    const stripe = new Stripe(stripeSecretKey)
    const baseUrl = request.nextUrl.origin
    const successPath = getEthicalAgentFarmCheckoutSuccessPath(offerSlug)
    const fulfillmentMetadata = {
      offerSlug: offer.slug,
      offerName: offer.name,
      billingMode: "one-time",
      source: "ethical-agent-farm",
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: fulfillmentMetadata,
      payment_intent_data: {
        metadata: fulfillmentMetadata,
      },
      success_url: new URL(successPath, baseUrl).toString(),
      cancel_url: new URL(`/ethical-agent-farm/offers/${offer.slug}`, baseUrl).toString(),
      allow_promotion_codes: false,
      billing_address_collection: "auto",
      automatic_tax: { enabled: false },
      phone_number_collection: { enabled: false },
    })

    return NextResponse.json({
      ok: true,
      checkoutConfigured: true,
      offerSlug: offer.slug,
      sessionId: session.id,
      url: session.url,
    })
  } catch {
    return NextResponse.json({ ok: false, error: "Checkout failed" }, { status: 500 })
  }
}
