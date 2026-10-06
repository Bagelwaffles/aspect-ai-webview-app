import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { createScheduledTaskStore, createTaskDelivery, initialTaskState, operateScheduledTask, scheduledTaskDefinitions, scheduledTaskOwner, taskErrorCode } from "@/lib/server/scheduled-task-engine"
import { scheduledTaskWorker } from "@/lib/server/scheduled-task-workers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
export async function GET(request: NextRequest) {
  const authorization = await authorizeOwnerApiRequest(request)
  if (!authorization.ok) return json({ ok: false, code: authorization.code }, authorization.status)
  try {
    const store = createScheduledTaskStore()
    const owner = scheduledTaskOwner()
    const tasks = await Promise.all(scheduledTaskDefinitions.map(async definition => ({ definition, state: await store.read(definition.id) ?? initialTaskState(definition, owner, new Date()) })))
    return json({ ok: true, tasks, schedulerConfigured: process.env.AMS_SCHEDULED_TASKS_ENABLED === "true", schedulerProofRequired: true })
  } catch (error) { return json({ ok: false, code: taskErrorCode(error) }, 503) }
}
const inputSchema = z.object({ id: z.string().max(100), action: z.enum(["pause", "resume", "run", "retry"]), requestId: z.string().uuid().optional() }).strict().refine(input => input.action !== "run" || Boolean(input.requestId))
export async function POST(request: NextRequest) {
  const authorization = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!authorization.ok) return json({ ok: false, code: authorization.code }, authorization.status)
  const input = inputSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return json({ ok: false, code: "TASK_INPUT_INVALID" }, 400)
  const definition = scheduledTaskDefinitions.find(task => task.id === input.data.id)
  if (!definition) return json({ ok: false, code: "TASK_NOT_FOUND" }, 404)
  try {
    const result = await operateScheduledTask({ definition, action: input.data.action, requestId: input.data.requestId, owner: scheduledTaskOwner(), store: createScheduledTaskStore(), worker: scheduledTaskWorker, deliver: createTaskDelivery() })
    return json({ ok: result.outcome !== "failed" && result.outcome !== "busy", ...result }, result.outcome === "busy" ? 409 : result.outcome === "failed" ? 502 : 200)
  } catch (error) { return json({ ok: false, code: taskErrorCode(error) }, 503) }
}
