import { NextRequest, NextResponse } from "next/server"

import { runTwitchAutomaticPrivateShorts } from "@/lib/server/twitch-auto-factory"
import { authorizeMediaWorker } from "@/lib/server/twitch-short-render-jobs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  if (!(await authorizeMediaWorker(request.headers.get("authorization")))) {
    return NextResponse.json(
      { ok: false, code: "MEDIA_WORKER_UNAUTHORIZED" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    )
  }

  try {
    const result = await runTwitchAutomaticPrivateShorts()
    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 200) : "TWITCH_AUTO_FACTORY_FAILED"
    return NextResponse.json(
      { ok: false, code },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
}
