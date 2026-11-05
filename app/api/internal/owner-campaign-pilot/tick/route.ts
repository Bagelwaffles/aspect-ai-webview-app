import { NextRequest, NextResponse } from "next/server"
import {
  authorizedOwnerCampaignWorker,
  ownerCampaignAutoSendAllowed,
  tickOwnerCampaignPilot,
} from "@/lib/server/owner-campaign-pilot-scheduler"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

const reply = (status: number, body: Record<string, unknown>) =>
  NextResponse.json(body, {status, headers: {"Cache-Control": "no-store"}})

/** Server-to-server Preview-only worker. Never used for real customer campaigns. */
export async function POST(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return reply(404,{ok:false})
  if (!ownerCampaignAutoSendAllowed()) return reply(503,{ok:false,code:"OWNER_CAMPAIGN_AUTOSEND_DISABLED"})
  if (!authorizedOwnerCampaignWorker(request.headers.get("authorization"))) return reply(401,{ok:false})
  try {
    const result = await tickOwnerCampaignPilot()
    return reply(200,{ok:true,...result})
  } catch {
    return reply(503,{ok:false,code:"OWNER_CAMPAIGN_WORKER_UNAVAILABLE"})
  }
}
