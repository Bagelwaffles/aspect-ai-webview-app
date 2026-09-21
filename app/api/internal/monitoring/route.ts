import { NextRequest, NextResponse } from "next/server"

import {
  getBackendMonitoringSnapshot,
  listBackendMonitorEvents,
  runBackendMonitoring,
} from "@/lib/server/backend-monitoring"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function GET(request: NextRequest) {
  const authorization = await authorizeOwnerApiRequest(request)
  if (!authorization.ok) {
    return json({ ok: false, code: authorization.code }, authorization.status)
  }

  try {
    const [snapshot, events] = await Promise.all([
      getBackendMonitoringSnapshot(),
      listBackendMonitorEvents(50),
    ])
    return json({
      ok: true,
      snapshot,
      events,
      customerFacing: false,
      executionPerformed: false,
    })
  } catch {
    return json({ ok: false, code: "BACKEND_MONITORING_STORE_UNAVAILABLE" }, 503)
  }
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeOwnerApiRequest(request, {
    requireTrustedOrigin: true,
  })
  if (!authorization.ok) {
    return json({ ok: false, code: authorization.code }, authorization.status)
  }

  const snapshot = await runBackendMonitoring()
  return json({
    ok: true,
    snapshot,
    customerFacing: false,
    executionPerformed: false,
  })
}
