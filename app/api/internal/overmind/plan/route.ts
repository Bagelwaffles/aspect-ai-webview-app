import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"

import { createOvermindPlan, overmindControlState } from "@/lib/server/overmind-control-plane"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!authorization.ok) {
    return json({ ok: false, code: authorization.code }, authorization.status)
  }

  try {
    const plan = createOvermindPlan(await request.json())
    return json(
      {
        ok: true,
        plan,
        control: overmindControlState(),
        persisted: false,
        executionPerformed: false,
      },
      201,
    )
  } catch (error) {
    if (error instanceof ZodError) {
      return json(
        {
          ok: false,
          code: "INVALID_OVERMIND_PLAN_REQUEST",
          error: "Objective or requested agents were not valid.",
        },
        400,
      )
    }

    return json(
      {
        ok: false,
        code: "OVERMIND_PLAN_UNAVAILABLE",
        error: "Overmind planning could not be completed.",
      },
      503,
    )
  }
}
