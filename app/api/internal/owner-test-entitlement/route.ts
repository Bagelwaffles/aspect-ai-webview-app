import { NextRequest, NextResponse } from "next/server"

import { authorizeCustomerApiRequest } from "@/lib/server/customer-api-auth"
import { grantOwnerDailyQaCredits } from "@/lib/server/owner-qa-credits"

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
      { ok: false, code: "OWNER_SESSION_REQUIRED", error: "Signed AMS owner session required" },
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
    const grant = await grantOwnerDailyQaCredits(principal.subject)
    return noStore(
      {
        ok: true,
        grant: {
          state: grant.state,
          agent: "content",
          credits: grant.balance,
          dailyAllowance: grant.dailyAllowance,
          utcDay: grant.utcDay,
          recurringBilling: false,
          purpose: "owner-qa",
        },
      },
      grant.state === "granted" ? 201 : 200,
    )
  } catch {
    return noStore(
      {
        ok: false,
        code: "OWNER_QA_ALLOWANCE_UNAVAILABLE",
        error: "Owner QA allowance could not be granted",
      },
      503,
    )
  }
}
