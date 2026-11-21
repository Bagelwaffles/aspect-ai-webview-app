import { createAuditOwnerPilotReadinessHandler } from "@/lib/server/quick-audit-owner-readiness"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = createAuditOwnerPilotReadinessHandler()
