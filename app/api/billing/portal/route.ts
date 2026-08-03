import { NextRequest, NextResponse } from "next/server"

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
    const backendUrl = process.env.AMS_BACKEND_URL?.trim()
    const fulfillmentSecret = process.env.AMS_STRIPE_FULFILLMENT_SECRET?.trim()
    const organizationId = process.env.AMS_DEFAULT_ORGANIZATION_ID?.trim()

    if (!backendUrl || !fulfillmentSecret || !organizationId) {
      return NextResponse.json(
        {
          error: "Authenticated billing portal is not configured",
          code: "BILLING_PORTAL_NOT_CONFIGURED",
        },
        { status: 503 },
      )
    }

    const response = await fetch(`${backendUrl.replace(/\/$/, "")}/internal/stripe/portal-session`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ams-fulfillment-secret": fulfillmentSecret,
      },
      body: JSON.stringify({
        organizationId,
        returnPath: "/billing",
      }),
      cache: "no-store",
    })

    const json = await response.json().catch(() => null)
    return NextResponse.json(json ?? { error: "Portal failed" }, { status: response.status })
  } catch {
    return NextResponse.json({ error: "Portal failed" }, { status: 500 })
  }
}
