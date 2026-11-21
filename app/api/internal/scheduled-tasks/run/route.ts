import { NextRequest, NextResponse } from "next/server"
import { authorizeMonitoringCron } from "@/lib/server/backend-monitoring"
import { createScheduledTaskStore, createTaskDelivery, operateScheduledTask, scheduledTaskDefinitions, scheduledTaskOwner, taskErrorCode } from "@/lib/server/scheduled-task-engine"
import { scheduledTaskWorker } from "@/lib/server/scheduled-task-workers"
import { authorizeScheduledWorker } from "@/lib/server/scheduled-task-worker-auth"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
export async function GET(request: NextRequest) {
  const header = request.headers.get("authorization")
  const cron = authorizeMonitoringCron(header)
  const worker = cron ? null : await authorizeScheduledWorker(header)
  if (!cron && !worker) return json({ ok: false, code: "TASK_CRON_UNAUTHORIZED" }, 401)
  if (process.env.AMS_SCHEDULED_TASKS_ENABLED !== "true") return json({ ok: false, code: "TASK_SCHEDULER_DISABLED" }, 503)
  try {
    const store = createScheduledTaskStore(), owner = scheduledTaskOwner(), now = new Date()
    const results = await Promise.all(scheduledTaskDefinitions.map(async definition => {
      const result = await operateScheduledTask({ definition, action: "tick", independentSchedule: worker?.independentSchedule === true, owner, store, worker: scheduledTaskWorker, deliver: createTaskDelivery(), now })
      return { id: definition.id, outcome: result.outcome, lastScheduledSuccess: result.state?.lastScheduledSuccess ?? null, notification: result.state?.history[0]?.notification ?? "none" }
    }))
    const ok = results.every(result => result.outcome !== "failed" && result.outcome !== "busy")
    return json({ ok, results, executionVerified: results.some(result => result.outcome === "succeeded") }, ok ? 200 : 502)
  } catch (error) { return json({ ok: false, code: taskErrorCode(error) }, 503) }
}
