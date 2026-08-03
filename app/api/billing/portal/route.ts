import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

import { authorizePaidApiRequest } from "@/lib/server/customer-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const principal = await authorizePaidApiRequest(request)
  if (!principal) {
    return NextResponse.json(
      { ok: false, error: "Authentication required", code: "CUSTOMER_AUTH_REQUIRED" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    )
  }

  const email =
    principal.kind === "customer"
      ? principal.email
      : process.env.AMS_DEFAULT_USER_EMAIL?.trim().toLowerCase()
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim()

  if (!email || !stripeSecretKey) {
    return NextResponse.json(
      { ok: false, error: "Billing portal is not configured", code: "BILLING_PORTAL_NOT_CONFIGURED" },
      { status: 503 },
    )
  }

  try {
    const stripe = new Stripe(stripeSecretKey)
    const customers = await stripe.customers.list({ email, limit: 1 })
    const customer = customers.data[0]

    if (!customer) {
      return NextResponse.json(
        { ok: false, error: "No Stripe customer exists for this account", code: "STRIPE_CUSTOMER_NOT_FOUND" },
        { status: 404 },
      )
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: new URL("/billing", request.nextUrl.origin).toString(),
    })

    return NextResponse.json(
      { ok: true, url: session.url },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch {
    return NextResponse.json({ ok: false, error: "Portal failed" }, { status: 502 })
  }
}
