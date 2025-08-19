import { type NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

export async function POST(request: NextRequest) {
  console.log("[v0] Stripe checkout session creation started")

  // Check environment variables
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY
  const stripePriceId = process.env.STRIPE_PRICE_ID
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  console.log("[v0] Environment variables check:")
  console.log("[v0] STRIPE_SECRET_KEY exists:", !!stripeSecretKey)
  console.log("[v0] STRIPE_SECRET_KEY starts with:", stripeSecretKey?.substring(0, 7))
  console.log("[v0] STRIPE_PRICE_ID exists:", !!stripePriceId)
  console.log("[v0] NEXT_PUBLIC_APP_URL exists:", !!appUrl)

  if (!stripeSecretKey) {
    console.log("[v0] Missing STRIPE_SECRET_KEY")
    return NextResponse.json(
      {
        error: "Stripe secret key not configured",
        details:
          "Please add your STRIPE_SECRET_KEY to environment variables. Get it from your Stripe Dashboard > Developers > API keys.",
      },
      { status: 500 },
    )
  }

  if (!stripePriceId) {
    console.log("[v0] Missing STRIPE_PRICE_ID")
    return NextResponse.json(
      {
        error: "Stripe price ID not configured",
        details:
          "Please add your STRIPE_PRICE_ID to environment variables. Create a subscription price in your Stripe Dashboard > Products.",
      },
      { status: 500 },
    )
  }

  if (!appUrl) {
    console.log("[v0] Missing NEXT_PUBLIC_APP_URL")
    return NextResponse.json(
      {
        error: "App URL not configured",
        details: "Please add your NEXT_PUBLIC_APP_URL to environment variables.",
      },
      { status: 500 },
    )
  }

  try {
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-12-18.acacia",
    })

    console.log("[v0] Creating Stripe checkout session with price:", stripePriceId)

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pricing`,
      metadata: {
        source: "vo-app-starter",
      },
    })

    console.log("[v0] Stripe session created successfully:", session.id)

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error("[v0] Stripe error:", error)

    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      {
        error: "Failed to create checkout session",
        details: errorMessage,
      },
      { status: 500 },
    )
  }
}
