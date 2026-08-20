import { NextResponse } from "next/server"

import {
  quickAuditInfrastructureReady,
  setQuickAuditRuntimeLaunchEnabled,
} from "@/lib/server/quick-audit-runtime"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  if (!quickAuditInfrastructureReady()) {
    return NextResponse.json(
      { ok: false, enabled: false, error: "Quick Audit infrastructure is not ready" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }

  try {
    await setQuickAuditRuntimeLaunchEnabled(true)
    return NextResponse.json(
      { ok: true, enabled: true },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch {
    return NextResponse.json(
      { ok: false, enabled: false, error: "Quick Audit launch state could not be persisted" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
}
