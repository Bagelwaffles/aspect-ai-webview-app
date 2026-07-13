import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID;
const SAFE_ORG_ID = "cmrgmpcd50001iqyo57iirzo6";
const SAFE_USER_ID = "cmrgmpccu0000iqyo2p2stz99";

export async function POST(request: NextRequest) {
  try {
    const stripeSecretKey = STRIPE_SECRET_KEY?.trim();
    const stripePriceId = STRIPE_PRICE_ID?.trim();

    if (!stripeSecretKey || !stripePriceId) {
      return NextResponse.json({ error: "Billing checkout not configured" }, { status: 503 });
    }

    const stripe = new Stripe(stripeSecretKey);
    const body = await request.json().catch(() => ({}));
    const organizationId = typeof body.organizationId === "string" ? body.organizationId : SAFE_ORG_ID;
    const userId = typeof body.userId === "string" ? body.userId : SAFE_USER_ID;
    const baseUrl = request.nextUrl.origin;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      client_reference_id: organizationId,
      line_items: [{ price: stripePriceId, quantity: 1 }],
      metadata: {
        organizationId,
        userId
      },
      subscription_data: {
        metadata: {
          organizationId,
          userId
        },
        trial_period_days: 14
      },
      success_url: new URL("/billing/success", baseUrl).toString(),
      cancel_url: new URL("/billing", baseUrl).toString(),
      allow_promotion_codes: false,
      billing_address_collection: "auto",
      automatic_tax: { enabled: false }
    });

    return NextResponse.json({ ok: true, sessionId: session.id, url: session.url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Checkout failed" },
      { status: 500 }
    );
  }
}
