import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const AMS_FULFILLMENT_BACKEND_URL = process.env.AMS_FULFILLMENT_BACKEND_URL;
const AMS_STRIPE_FULFILLMENT_SECRET = process.env.AMS_STRIPE_FULFILLMENT_SECRET;

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

const FORWARDED_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted"
]);

function redactId(id: string): string {
  return `${id.substring(0, 8)}...`;
}

async function forwardFulfillment(event: Stripe.Event) {
  if (!AMS_FULFILLMENT_BACKEND_URL || !AMS_STRIPE_FULFILLMENT_SECRET) {
    return {
      ok: false,
      status: 503,
      body: {
        received: true,
        forwarded: false,
        reason: "FULFILLMENT_BACKEND_NOT_CONFIGURED"
      }
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(AMS_FULFILLMENT_BACKEND_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ams-fulfillment-secret": AMS_STRIPE_FULFILLMENT_SECRET
      },
      body: JSON.stringify({
        source: "aspect-ai-webview-app",
        stripeEventId: event.id,
        eventType: event.type,
        created: event.created,
        livemode: event.livemode,
        event
      }),
      signal: controller.signal
    });

    const text = await response.text();
    let parsed: Record<string, unknown> | string | null = null;
    if (text) {
      try {
        parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        parsed = text;
      }
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        body: {
          received: true,
          forwarded: false,
          reason: "BACKEND_UNAVAILABLE"
        }
      };
    }

    return {
      ok: true,
      status: 200,
      body: {
        received: true,
        forwarded: true,
        backend: parsed ?? undefined
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!stripe || !STRIPE_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
    }

    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json({ error: "Missing signature header" }, { status: 400 });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.warn("[Stripe] Signature verification failed:", errorMessage);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    console.log(`[Stripe] Webhook received: ${event.type} (${redactId(event.id)})`);

    if (!FORWARDED_EVENT_TYPES.has(event.type)) {
      return NextResponse.json({
        received: true,
        forwarded: false,
        processed: false,
        reason: "UNHANDLED_EVENT_TYPE"
      });
    }

    const forwarded = await forwardFulfillment(event);
    if (!forwarded.ok) {
      console.error(`[Stripe] Backend fulfillment unavailable for ${event.type} (${redactId(event.id)})`);
      return NextResponse.json(forwarded.body, { status: forwarded.status });
    }

    return NextResponse.json(forwarded.body, { status: 200 });
  } catch (error) {
    console.error("[Stripe] Webhook fatal error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    status: "listening",
    endpoint: "/api/webhooks/stripe",
    configured: Boolean(STRIPE_SECRET_KEY && STRIPE_WEBHOOK_SECRET)
  });
}
