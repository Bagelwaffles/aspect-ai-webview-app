import { ownerAuditPilotWebhookGET, ownerAuditPilotWebhookPOST } from "@/lib/server/owner-audit-pilot-webhook"
import type { NextRequest } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  return ownerAuditPilotWebhookPOST(request)
}

export async function GET(request: NextRequest) {
  return ownerAuditPilotWebhookGET(request)
}
