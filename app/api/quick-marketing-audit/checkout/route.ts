import { NextRequest } from "next/server"

import { createQuickAuditCheckoutHandler } from "@/lib/server/quick-audit-checkout"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) { return createQuickAuditCheckoutHandler()(request) }
