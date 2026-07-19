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

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
const SAFE_ORG_ID = "cmrgmpcd50001iqyo57iirzo6"
const SAFE_USER_ID = "cmrgmpccu0000iqyo2p2stz99"

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

export async function POST(request: NextRequest) {
  try {
    const stripeSecretKey = STRIPE_SECRET_KEY?.trim()
    if (!stripeSecretKey) {
      return NextResponse.json({ ok: false, error: "Checkout not configured" }, { status: 503 })
    }

    const body = await request.json().catch(() => null)
    const offerSlug = normalize(body?.offer)
    const organizationId = normalize(body?.organizationId) || SAFE_ORG_ID
    const userId = normalize(body?.userId) || SAFE_USER_ID

    const offer = getEthicalAgentFarmCheckoutOffer(offerSlug)
    if (!offer) {
      return NextResponse.json({ ok: false, error: "Unknown offer" }, { status: 400 })
    }

    const priceId = getEthicalAgentFarmCheckoutPriceId(offerSlug)
    if (!priceId) {
      return NextResponse.json(
        {
          ok: false,
          checkoutConfigured: false,
          error: "Offer checkout not configured",
          fallbackPath: getEthicalAgentFarmCheckoutFallbackPath(offerSlug),
          requestPath: getEthicalAgentFarmCheckoutFallbackPath(offerSlug),
        },
        { status: 503 }
      )
    }

    const stripe = new Stripe(stripeSecretKey)
    const baseUrl = request.nextUrl.origin
    const successPath = getEthicalAgentFarmCheckoutSuccessPath(offerSlug)

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: organizationId,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        offerSlug: offer.slug,
        offerName: offer.name,
        organizationId,
        userId,
        billingMode: "one-time"
      },
      payment_intent_data: {
        metadata: {
          offerSlug: offer.slug,
          offerName: offer.name,
          organizationId,
          userId,
          billingMode: "one-time"
        }
      },
      success_url: new URL(successPath, baseUrl).toString(),
      cancel_url: new URL(`/ethical-agent-farm/offers/${offer.slug}`, baseUrl).toString(),
      allow_promotion_codes: false,
      billing_address_collection: "auto",
      automatic_tax: { enabled: false },
      phone_number_collection: { enabled: false }
    })

    return NextResponse.json({
      ok: true,
      checkoutConfigured: true,
      offerSlug: offer.slug,
      sessionId: session.id,
      url: session.url
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Checkout failed" },
      { status: 500 }
    )
  }
}
