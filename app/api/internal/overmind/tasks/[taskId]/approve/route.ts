import { NextRequest, NextResponse } from "next/server"
import { z, ZodError } from "zod"

import { approveOvermindTask } from "@/lib/server/overmind-task-store"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ taskId: string }> }

const inputSchema = z
  .object({
    confirmation: z.literal("APPROVE_OVERMIND_TASK"),
    actionDigest: z.string().regex(/^[a-f0-9]{64}$/),
    expiresInMinutes: z.number().int().min(1).max(30).optional(),
  })
  .strict()

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest, context: RouteContext) {
  const authorization = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!authorization.ok) return json({ ok: false, code: authorization.code }, authorization.status)

  try {
    const { taskId } = await context.params
    const input = inputSchema.parse(await request.json())
    const task = await approveOvermindTask(
      taskId,
      { actionDigest: input.actionDigest, expiresInMinutes: input.expiresInMinutes },
      authorization.principal.subject,
    )
    return json({ ok: true, task, executionPerformed: false })
  } catch (error) {
    if (error instanceof ZodError) return json({ ok: false, code: "INVALID_OVERMIND_APPROVAL" }, 400)
    const code = error instanceof Error ? error.message : "OVERMIND_APPROVAL_FAILED"
    const status = code === "OVERMIND_TASK_NOT_FOUND" ? 404 : code.includes("MISMATCH") ? 409 : 422
    return json({ ok: false, code }, status)
  }
}
