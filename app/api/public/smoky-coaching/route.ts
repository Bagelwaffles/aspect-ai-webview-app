import { NextRequest, NextResponse } from "next/server"

import { buildSmokyPublicCoachingFeed, SMOKY_PUBLIC_COACHING_FEED_VERSION } from "@/lib/server/smoky-public-coaching"
import { getLatestTwitchMediaQueue } from "@/lib/server/twitch-media-factory"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ALLOWED_ORIGINS = new Set([
  "https://smokybanana03-training.vercel.app",
  "https://smoky.aspectmarketingsolutions.app",
])

function publicHeaders(request: NextRequest, enabled: boolean) {
  const origin = request.headers.get("origin")
  const headers = new Headers({
    "Cache-Control": enabled ? "public, s-maxage=120, stale-while-revalidate=300" : "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  })
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin)
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS")
  }
  return headers
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: publicHeaders(request, false) })
}

export async function GET(request: NextRequest) {
  // Production default is OFF. The existing owner dashboard and Twitch
  // agent stay private; this is ONLY a small public-safe clip projection.
  if (process.env.AMS_SMOKY_PUBLIC_COACHING_ENABLED !== "true") {
    return NextResponse.json({
      ok: true, enabled: false, version: SMOKY_PUBLIC_COACHING_FEED_VERSION,
      items: [], reason: "NOT_ENABLED",
    }, { headers: publicHeaders(request, false) })
  }

  try {
    const queue = await getLatestTwitchMediaQueue()
    const items = buildSmokyPublicCoachingFeed(queue)
    return NextResponse.json({
      ok: true, enabled: true, version: SMOKY_PUBLIC_COACHING_FEED_VERSION,
      source: "analyzed-public-twitch-clips-only", items,
      note: "Clip-specific AI observations. No unseen gameplay or YouTube VOD matches inferred.",
    }, { headers: publicHeaders(request, true) })
  } catch {
    return NextResponse.json({
      ok: false, enabled: false, version: SMOKY_PUBLIC_COACHING_FEED_VERSION,
      items: [], reason: "SOURCE_UNAVAILABLE",
    }, { status: 503, headers: publicHeaders(request, false) })
  }
}
