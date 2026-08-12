import { NextRequest, NextResponse } from "next/server"

import { authorizeCustomerApiRequest } from "@/lib/server/customer-api-auth"
import { grantOwnerContentTestEntitlement } from "@/lib/server/entitlements"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CONFIRMATION = "GRANT_OWNER_CONTENT_TEST"

function noStore(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

function normalizedOwnerEmail() {
  return process.env.AMS_OWNER_EMAIL?.trim().toLowerCase() ?? ""
}

function requestHasTrustedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin")
  const configuredUrl = process.env.PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL
  if (!origin || !configuredUrl) return false

  try {
    return new URL(origin).origin === new URL(configuredUrl).origin
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  if (process.env.AMS_OWNER_TEST_ENTITLEMENT_ENABLED !== "true") {
    return noStore(
      { ok: false, code: "OWNER_TEST_ENTITLEMENT_DISABLED", error: "Owner test grant is disabled" },
      404,
    )
  }

  if (!requestHasTrustedOrigin(request)) {
    return noStore(
      { ok: false, code: "UNTRUSTED_ORIGIN", error: "Owner action origin was not accepted" },
      403,
    )
  }

  const principal = await authorizeCustomerApiRequest(request)
  const ownerEmail = normalizedOwnerEmail()
  if (
    !principal ||
    principal.kind !== "customer" ||
    !ownerEmail ||
    principal.billingEmail !== ownerEmail
  ) {
    return noStore(
      { ok: false, code: "OWNER_SESSION_REQUIRED", error: "Signed owner session required" },
      403,
    )
  }

  const contentType = request.headers.get("content-type") ?? ""
  const confirmation = contentType.includes("application/json")
    ? (await request.json().catch(() => null))?.confirmation
    : (await request.formData().catch(() => null))?.get("confirmation")
  if (confirmation !== CONFIRMATION) {
    return noStore(
      { ok: false, code: "CONFIRMATION_REQUIRED", error: "Exact owner confirmation required" },
      400,
    )
  }

  try {
    const grant = await grantOwnerContentTestEntitlement(principal.subject, 3)
    return noStore(
      {
        ok: true,
        grant: {
          state: grant.state,
          agent: "content",
          credits: grant.credits,
          recurringBilling: false,
        },
      },
      grant.state === "granted" ? 201 : 200,
    )
  } catch {
    return noStore(
      {
        ok: false,
        code: "OWNER_TEST_ENTITLEMENT_UNAVAILABLE",
        error: "Owner test entitlement could not be granted",
      },
      503,
    )
  }
}
