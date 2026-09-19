import { NextRequest, NextResponse } from "next/server"

import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { getRenderedShortPreview } from "@/lib/server/twitch-short-render-jobs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function GET(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request)
  if (!auth.ok) return json({ ok: false, code: auth.code }, auth.status)
  const jobId = request.nextUrl.searchParams.get("jobId")?.trim() ?? ""
  if (!jobId) return json({ ok: false, code: "TWITCH_SHORT_RENDER_JOB_ID_REQUIRED" }, 400)

  const result = await getRenderedShortPreview(jobId)
  if (!result) return json({ ok: false, code: "TWITCH_SHORT_RENDER_PREVIEW_NOT_READY" }, 404)
  return json({ ok: true, ...result })
}
