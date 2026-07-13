import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.AMS_BACKEND_URL || "https://aspectapi-production.up.railway.app";
const FULFILLMENT_SECRET = process.env.AMS_STRIPE_FULFILLMENT_SECRET;
const SAFE_ORG_ID = "cmrgmpcd50001iqyo57iirzo6";

export async function POST(request: NextRequest) {
  try {
    if (!FULFILLMENT_SECRET) {
      return NextResponse.json({ error: "Billing portal not configured" }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const organizationId = typeof body.organizationId === "string" ? body.organizationId : SAFE_ORG_ID;

    const response = await fetch(`${BACKEND_URL.replace(/\/$/, "")}/internal/stripe/portal-session`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ams-fulfillment-secret": FULFILLMENT_SECRET
      },
      body: JSON.stringify({
        organizationId,
        returnPath: "/billing"
      }),
      cache: "no-store"
    });

    const json = await response.json().catch(() => null);
    return NextResponse.json(json ?? { error: "Portal failed" }, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Portal failed" },
      { status: 500 }
    );
  }
}
