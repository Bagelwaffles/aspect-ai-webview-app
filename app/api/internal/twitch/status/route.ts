import { NextRequest, NextResponse } from "next/server"

import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { getLatestStreamIntelligencePackage } from "@/lib/server/stream-intelligence"
import { getLatestTwitchMediaQueue } from "@/lib/server/twitch-media-factory"
import {
  isTwitchShortRenderConfigured,
  listLatestTwitchShortRenderJobs,
} from "@/lib/server/twitch-short-render-jobs"
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
    const [twitch, streamIntelligence, mediaFactory, shortRenderJobs] = await Promise.all([
      getTwitchPilotStatus(),
      getLatestStreamIntelligencePackage(),
      getLatestTwitchMediaQueue(),
      listLatestTwitchShortRenderJobs(),
    ])
    return json({
      ok: true,
      ...twitch,
      streamIntelligence,
      mediaFactory,
      shortRenderer: {
        configured: isTwitchShortRenderConfigured(),
        jobs: shortRenderJobs,
      },
    })
  } catch {
    return json({ ok: false, code: "TWITCH_STATUS_UNAVAILABLE" }, 503)
  }
}
