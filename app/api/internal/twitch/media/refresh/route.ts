import { NextRequest, NextResponse } from "next/server"

import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { refreshLatestTwitchMediaQueue } from "@/lib/server/twitch-media-factory"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!auth.ok) return json({ ok: false, code: auth.code }, auth.status)

  try {
    const mediaFactory = await refreshLatestTwitchMediaQueue()
    return json({ ok: true, mediaFactory })
  } catch (error) {
    const code = error instanceof Error ? error.message : "TWITCH_MEDIA_REFRESH_FAILED"
    const status = code === "TWITCH_MEDIA_SUMMARY_REQUIRED" ? 409 : 503
    return json({ ok: false, code }, status)
  }
}
