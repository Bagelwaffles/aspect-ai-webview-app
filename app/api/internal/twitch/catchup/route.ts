import { NextRequest, NextResponse } from "next/server"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { getTwitchCatchupStatus, startTwitchCatchup, retryRemovedTwitchVod, retryCancelledTwitchVod } from "@/lib/server/twitch-catchup"
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
  if (body.action === "retry-cancelled") {
    if (!/^\d+$/.test(body.vodId ?? "")) return json({ ok: false, code: "TWITCH_CATCHUP_INPUT_INVALID" }, 400)
    try { return json({ ok: true, ...publicStatus(await retryCancelledTwitchVod({ vodId: body.vodId, approved: true })) }) }
    catch (error) { return json({ ok: false, code: safeError(error) }, 503) }
  }
  if (body.action === "retry-removed") {
    if (!/^\d+$/.test(body.vodId ?? "") || !/^[A-Za-z0-9_-]{11}$/.test(body.videoId ?? "")) return json({ ok: false, code: "TWITCH_CATCHUP_INPUT_INVALID" }, 400)
    try { return json({ ok: true, ...publicStatus(await retryRemovedTwitchVod({ ...body, approved: true })) }) }
    catch (error) { return json({ ok: false, code: safeError(error) }, 503) }
  }
  try { return json({ ok: true, ...publicStatus(await startTwitchCatchup()) }) }
  catch (error) { return json({ ok: false, code: safeError(error) }, 503) }
}
