import { NextRequest, NextResponse } from "next/server"

import { ingestBackendMonitorEvents } from "@/lib/server/maintenance-lifecycle"

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
  const maintenanceEnabled = process.env.AMS_MAINTENANCE_ENABLED === "true"
  let maintenance = { enabled: maintenanceEnabled, ingested: 0, duplicates: 0, ignored: 0, failed: false }
  if (maintenanceEnabled && snapshot.newEvents.length) {
    try {
      const outcome = await ingestBackendMonitorEvents(snapshot.newEvents)
      maintenance = { enabled: true, ...outcome, failed: false }
    } catch {
      // Monitoring continues; no implicit repair or unsafe fallback when persistence fails.
      maintenance.failed = true
    }
  }
  return NextResponse.json(
    {
      ok: true,
      checkedAt: snapshot.checkedAt,
      overallStatus: snapshot.overallStatus,
      monitors: snapshot.results.length,
      newEvents: snapshot.newEvents.length,
      alertDelivery: snapshot.alertDelivery,
      maintenance,
      customerFacing: false,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
