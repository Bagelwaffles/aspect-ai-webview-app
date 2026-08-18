import { NextRequest, NextResponse } from "next/server"

import { pairBrowserWorker } from "@/lib/server/browser-control"

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body.code !== "string" || body.code.length > 64) {
    return NextResponse.json({ error: "invalid_pairing_code" }, { status: 400 })
  }

  try {
    const paired = await pairBrowserWorker({
      code: body.code,
      name: typeof body.name === "string" ? body.name : undefined,
      version: typeof body.version === "string" ? body.version : undefined,
      platform: typeof body.platform === "string" ? body.platform : undefined,
      browser: typeof body.browser === "string" ? body.browser : undefined,
    })
    return NextResponse.json(paired, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "pairing_failed"
    const status = message === "INVALID_OR_EXPIRED_PAIRING_CODE" ? 401 : message === "BROWSER_CONTROL_STORAGE_UNAVAILABLE" ? 503 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
