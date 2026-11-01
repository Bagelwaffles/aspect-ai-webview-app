import { NextRequest } from "next/server"

import { createQuickAuditResultHandler } from "@/lib/server/quick-audit-result"
import { createIsolatedPilotBuyerResultHandler } from "@/lib/server/quick-audit-isolated-result-reader"
import { normalizeQuickAuditLiveStripeSecret } from "@/lib/server/quick-audit-runtime"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const isolatedPilot = await createIsolatedPilotBuyerResultHandler()(request)
  if (isolatedPilot) return isolatedPilot
  normalizeQuickAuditLiveStripeSecret()
  return createQuickAuditResultHandler()(request)
}
