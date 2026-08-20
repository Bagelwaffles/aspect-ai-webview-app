import { createQuickAuditTestCheckoutHandler } from "@/lib/server/quick-audit-test-checkout"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const POST = createQuickAuditTestCheckoutHandler()
