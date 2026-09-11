import { NextRequest, NextResponse } from "next/server"

import { disconnectCustomerConnection } from "@/lib/server/customer-connections"
import { authorizeCustomerApiRequest } from "@/lib/server/customer-api-auth"
import { revokeGoogleDriveConnection } from "@/lib/server/google-drive-connection"
import { requestHasTrustedAppOrigin } from "@/lib/server/request-origin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function POST(request: NextRequest) {
  if (!requestHasTrustedAppOrigin(request)) {
    return json({ ok: false, code: "UNTRUSTED_ORIGIN" }, 403)
  }

  const principal = await authorizeCustomerApiRequest(request)
  if (!principal || principal.kind !== "customer") {
    return json({ ok: false, code: "CUSTOMER_SESSION_REQUIRED" }, 401)
  }

  try {
    const revoked = await revokeGoogleDriveConnection(principal.subject)
    await disconnectCustomerConnection(principal.subject, "google-drive")
    return json({ ok: true, provider: "google-drive", revoked })
  } catch (error) {
    const code = error instanceof Error ? error.message : "GOOGLE_DRIVE_DISCONNECT_FAILED"
    return json({ ok: false, code }, 503)
  }
}
