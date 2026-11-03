import { NextRequest, NextResponse } from "next/server"

import { ingestBackendMonitorEvents, replayableBackendMonitorEvents } from "@/lib/server/maintenance-lifecycle"
import { ingestGithubActionFailures } from "@/lib/server/maintenance-github-source"

import {
  authorizeMonitoringCron,
  listBackendMonitorEvents,
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
  if (maintenanceEnabled) {
    try {
      // Monitor state changes were persisted before maintenance ingestion. A transient
      // Redis error must not drop a finding merely because it is not a NEW event next run.
      const persisted = await listBackendMonitorEvents(100)
      const replay = replayableBackendMonitorEvents(snapshot.newEvents, persisted)
      const outcome = replay.length
        ? await ingestBackendMonitorEvents(replay)
        : { ingested: 0, duplicates: 0, ignored: 0 }
      maintenance = { enabled: true, ...outcome, failed: false }
    } catch {
      // Monitoring continues; a failed source/Redis read is explicitly reported.
      maintenance.failed = true
    }
  }
  let githubMonitoring = { enabled: maintenanceEnabled, seen: 0, ingested: 0, duplicates: 0, failed: false }
  if (maintenanceEnabled) {
    try {
      const outcome = await ingestGithubActionFailures()
      githubMonitoring = { enabled: true, ...outcome, failed: false }
    } catch {
      // GitHub API or Redis outage is never interpreted as "no findings".
      githubMonitoring.failed = true
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
      githubMonitoring,
      customerFacing: false,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
