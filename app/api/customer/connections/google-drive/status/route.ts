import { NextRequest, NextResponse } from "next/server"

import { listCustomerConnections } from "@/lib/server/customer-connections"
import { authorizeCustomerApiRequest } from "@/lib/server/customer-api-auth"
import { isGoogleDriveConnectorConfigured } from "@/lib/server/google-drive-connection"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function GET(request: NextRequest) {
  const principal = await authorizeCustomerApiRequest(request)
  if (!principal || principal.kind !== "customer") {
    return json({ ok: false, code: "CUSTOMER_SESSION_REQUIRED" }, 401)
  }

  const configured = isGoogleDriveConnectorConfigured()
  if (!configured) {
    return json({ ok: true, configured: false, connected: false, connection: null })
  }

  try {
    const connection = (await listCustomerConnections(principal.subject)).find(
      (item) => item.provider === "google-drive",
    )
    return json({
      ok: true,
      configured: true,
      connected: connection?.status === "active",
      connection: connection ?? null,
      scopeModel: "drive.file",
    })
  } catch {
    return json({ ok: false, code: "GOOGLE_DRIVE_STATUS_UNAVAILABLE" }, 503)
  }
}
