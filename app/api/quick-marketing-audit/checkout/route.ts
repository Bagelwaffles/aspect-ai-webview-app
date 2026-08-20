import { NextRequest } from "next/server"

import { createQuickAuditCheckoutHandler } from "@/lib/server/quick-audit-checkout"
import { ensureQuickAuditRuntimeLaunchState } from "@/lib/server/quick-audit-runtime"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  await ensureQuickAuditRuntimeLaunchState()
  return createQuickAuditCheckoutHandler()(request)
}
