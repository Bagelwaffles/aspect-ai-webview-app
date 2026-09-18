import { NextRequest, NextResponse } from "next/server"

import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { regenerateLatestStreamIntelligencePackage } from "@/lib/server/stream-intelligence"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function POST(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!auth.ok) return json({ ok: false, code: auth.code }, auth.status)

  try {
    const streamIntelligence = await regenerateLatestStreamIntelligencePackage()
    return json({ ok: true, streamIntelligence })
  } catch (error) {
    const code = error instanceof Error ? error.message : "STREAM_INTELLIGENCE_REGENERATION_FAILED"
    if (code === "STREAM_INTELLIGENCE_SESSION_NOT_FOUND") {
      return json({ ok: false, code }, 409)
    }
    return json({ ok: false, code: "STREAM_INTELLIGENCE_REGENERATION_FAILED" }, 503)
  }
}
