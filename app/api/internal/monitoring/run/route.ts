import { NextRequest, NextResponse } from "next/server"

import {
  authorizeMonitoringCron,
  runBackendMonitoring,
} from "@/lib/server/backend-monitoring"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: NextRequest) {
  if (!authorizeMonitoringCron(request.headers.get("authorization"))) {
    return NextResponse.json(
      { ok: false, code: "MONITORING_CRON_UNAUTHORIZED" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    )
  }

  const snapshot = await runBackendMonitoring()
  return NextResponse.json(
    {
      ok: true,
      checkedAt: snapshot.checkedAt,
      overallStatus: snapshot.overallStatus,
      monitors: snapshot.results.length,
      newEvents: snapshot.newEvents.length,
      alertDelivery: snapshot.alertDelivery,
      customerFacing: false,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
