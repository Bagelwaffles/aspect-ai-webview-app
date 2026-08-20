import { NextRequest } from "next/server"

import { createQuickAuditResultHandler } from "@/lib/server/quick-audit-result"
import { normalizeQuickAuditLiveStripeSecret } from "@/lib/server/quick-audit-runtime"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  normalizeQuickAuditLiveStripeSecret()
  return createQuickAuditResultHandler()(request)
}
