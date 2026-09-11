import { NextRequest, NextResponse } from "next/server"

import { listAgentContracts } from "@/lib/agent-contract-registry"
import { overmindControlState } from "@/lib/server/overmind-control-plane"
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

  return json({
    ok: true,
    control: overmindControlState(),
    contracts: listAgentContracts(),
  })
}
