import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"

import { createOvermindTask, listOvermindTasks } from "@/lib/server/overmind-task-store"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function GET(request: NextRequest) {
  const authorization = await authorizeOwnerApiRequest(request)
  if (!authorization.ok) return json({ ok: false, code: authorization.code }, authorization.status)

  try {
    return json({ ok: true, tasks: await listOvermindTasks() })
  } catch {
    return json({ ok: false, code: "OVERMIND_TASK_STORE_UNAVAILABLE" }, 503)
  }
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!authorization.ok) return json({ ok: false, code: authorization.code }, authorization.status)

  try {
    const body = await request.json()
    const task = await createOvermindTask(
      { objective: body?.objective, action: body?.action },
      authorization.principal.subject,
    )
    return json({ ok: true, task, executionPerformed: false }, 201)
  } catch (error) {
    if (error instanceof ZodError) return json({ ok: false, code: "INVALID_OVERMIND_TASK" }, 400)
    const code = error instanceof Error ? error.message : "OVERMIND_TASK_STORE_UNAVAILABLE"
    const status = code === "OVERMIND_AGENT_NOT_REGISTERED" || code === "OVERMIND_PERMISSION_NOT_DECLARED" ? 409 : 503
    return json({ ok: false, code }, status)
  }
}
