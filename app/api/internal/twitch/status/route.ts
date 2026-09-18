import { NextRequest, NextResponse } from "next/server"

import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { getLatestStreamIntelligencePackage } from "@/lib/server/stream-intelligence"
import { getTwitchPilotStatus } from "@/lib/server/twitch-pilot"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function GET(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request)
  if (!auth.ok) return json({ ok: false, code: auth.code }, auth.status)

  try {
    const [twitch, streamIntelligence] = await Promise.all([
      getTwitchPilotStatus(),
      getLatestStreamIntelligencePackage(),
    ])
    return json({ ok: true, ...twitch, streamIntelligence })
  } catch {
    return json({ ok: false, code: "TWITCH_STATUS_UNAVAILABLE" }, 503)
  }
}
