import { NextRequest, NextResponse } from "next/server"

import { authorizePaidApiRequest } from "@/lib/server/customer-api-auth"
import { getEntitlementSnapshot } from "@/lib/server/entitlements"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const principal = await authorizePaidApiRequest(request)
  if (!principal || principal.kind !== "customer") {
    return NextResponse.json(
      { ok: false, error: "Customer authentication required", code: "CUSTOMER_AUTH_REQUIRED" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    )
  }

  const snapshot = await getEntitlementSnapshot(principal.email).catch(() => null)
  if (!snapshot?.configured) {
    return NextResponse.json(
      { ok: false, error: "Entitlement service is not configured", code: "ENTITLEMENTS_NOT_CONFIGURED" },
      { status: 503 },
    )
  }

  return NextResponse.json(
    {
      ok: true,
      entitlement: {
        plan: snapshot.plan,
        subscriptionStatus: snapshot.subscriptionStatus,
        credits: {
          plan: snapshot.planCredits,
          topup: snapshot.topupCredits,
          total: snapshot.totalCredits,
        },
        agents: snapshot.agentSlugs,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
