import { NextRequest, NextResponse } from "next/server"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { getTwitchCatchupStatus, startTwitchCatchup } from "@/lib/server/twitch-catchup"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } }) }
function safeError(error: unknown) { return error instanceof Error && /^(TWITCH|YOUTUBE)_[A-Z0-9_]+$/.test(error.message) ? error.message : "TWITCH_CATCHUP_FAILED" }
function publicStatus(state: Awaited<ReturnType<typeof getTwitchCatchupStatus>>) {
  return { ...state, jobs: state.jobs.map(job => {
    const { lease, ...publicJob } = job
    void lease
    return publicJob
  }) }
}
export async function GET(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request)
  if (!auth.ok) return json({ ok: false, code: auth.code }, auth.status)
  try { return json({ ok: true, ...publicStatus(await getTwitchCatchupStatus()) }) }
  catch (error) { return json({ ok: false, code: safeError(error) }, 503) }
}
export async function POST(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!auth.ok) return json({ ok: false, code: auth.code }, auth.status)
  const body = await request.json().catch(() => null)
  if (body?.approved !== true) return json({ ok: false, code: "TWITCH_CATCHUP_APPROVAL_REQUIRED" }, 400)
  try { return json({ ok: true, ...publicStatus(await startTwitchCatchup()) }) }
  catch (error) { return json({ ok: false, code: safeError(error) }, 503) }
}
