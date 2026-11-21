import { createOwnerAuditDryRunHandler } from "@/lib/server/quick-audit-owner-dry-run"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const POST = createOwnerAuditDryRunHandler()
