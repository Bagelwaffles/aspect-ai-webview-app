import { NextRequest, NextResponse } from "next/server"

import {
  customerConnectionProviderSchema,
  disconnectCustomerConnection,
  isConnectionVaultConfigured,
  listCustomerConnections,
} from "@/lib/server/customer-connections"
import { authorizeCustomerApiRequest } from "@/lib/server/customer-api-auth"
import { requestHasTrustedAppOrigin } from "@/lib/server/request-origin"

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

  if (!isConnectionVaultConfigured()) {
    return json({ ok: true, configured: false, connections: [] })
  }

  try {
    return json({
      ok: true,
      configured: true,
      connections: await listCustomerConnections(principal.subject),
    })
  } catch {
    return json({ ok: false, code: "CONNECTION_VAULT_UNAVAILABLE" }, 503)
  }
}

export async function DELETE(request: NextRequest) {
  if (!requestHasTrustedAppOrigin(request)) {
    return json({ ok: false, code: "UNTRUSTED_ORIGIN" }, 403)
  }

  const principal = await authorizeCustomerApiRequest(request)
  if (!principal || principal.kind !== "customer") {
    return json({ ok: false, code: "CUSTOMER_SESSION_REQUIRED" }, 401)
  }

  const provider = customerConnectionProviderSchema.safeParse(request.nextUrl.searchParams.get("provider"))
  if (!provider.success) return json({ ok: false, code: "INVALID_CONNECTION_PROVIDER" }, 400)

  try {
    await disconnectCustomerConnection(principal.subject, provider.data)
    return json({ ok: true, provider: provider.data })
  } catch (error) {
    const code = error instanceof Error ? error.message : "CONNECTION_VAULT_UNAVAILABLE"
    return json({ ok: false, code }, 503)
  }
}
