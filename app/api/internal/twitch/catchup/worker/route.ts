import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { authorizeMediaWorker } from "@/lib/server/twitch-short-render-jobs"
import { beginTwitchVodUpload, claimTwitchVod, completeTwitchVod, runTwitchClipCatchup } from "@/lib/server/twitch-catchup"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300
const vodId = z.string().regex(/^\d+$/)
const lease = z.string().uuid()
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("clips") }).strict(),
  z.object({ action: z.literal("next") }).strict(),
  z.object({ action: z.literal("begin"), vodId, lease, bytes: z.number().int().positive() }).strict(),
  z.object({ action: z.literal("complete"), vodId, lease, videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/).optional(), errorCode: z.string().max(100).optional() }).strict(),
])
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } }) }
export async function POST(request: NextRequest) {
  if (!await authorizeMediaWorker(request.headers.get("authorization"))) return json({ ok: false, code: "MEDIA_WORKER_UNAUTHORIZED" }, 401)
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ ok: false, code: "TWITCH_CATCHUP_INPUT_INVALID" }, 400)
  try {
    const body = parsed.data
    if (body.action === "clips") return json({ ok: true, result: await runTwitchClipCatchup() })
    if (body.action === "next") return json({ ok: true, job: await claimTwitchVod() })
    if (body.action === "begin") return json({ ok: true, ...await beginTwitchVodUpload(body) })
    return json({ ok: true, job: await completeTwitchVod(body) })
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    const code = /^(TWITCH|YOUTUBE)_[A-Z0-9_]+$/.test(message) ? message : "TWITCH_CATCHUP_WORKER_FAILED"
    return json({ ok: false, code }, 503)
  }
}
