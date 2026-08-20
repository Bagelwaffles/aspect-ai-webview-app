import { createQuickAuditResultHandler } from "@/lib/server/quick-audit-result"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = createQuickAuditResultHandler()
