import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"

import { cancelOvermindTask } from "@/lib/server/overmind-task-store"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ taskId: string }> }

const inputSchema = z.object({ confirmation: z.literal("CANCEL_OVERMIND_TASK") }).strict()

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest, context: RouteContext) {
  const authorization = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!authorization.ok) return json({ ok: false, code: authorization.code }, authorization.status)

  try {
    inputSchema.parse(await request.json())
    const { taskId } = await context.params
    const task = await cancelOvermindTask(taskId, authorization.principal.subject)
    return json({ ok: true, task, executionPerformed: false })
  } catch (error) {
    if (error instanceof ZodError) return json({ ok: false, code: "INVALID_OVERMIND_CANCELLATION" }, 400)
    const code = error instanceof Error ? error.message : "OVERMIND_CANCELLATION_FAILED"
    return json({ ok: false, code }, code === "OVERMIND_TASK_NOT_FOUND" ? 404 : 503)
  }
}
