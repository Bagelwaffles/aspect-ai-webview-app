import { NextRequest, NextResponse } from "next/server"

import { browserAdminAuthorized, createBrowserPairingCode } from "@/lib/server/browser-control"

export async function POST(request: NextRequest) {
  if (!(await browserAdminAuthorized(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  try {
    return NextResponse.json(await createBrowserPairingCode())
  } catch (error) {
    const message = error instanceof Error ? error.message : "pairing_failed"
    return NextResponse.json({ error: message }, { status: message === "BROWSER_CONTROL_STORAGE_UNAVAILABLE" ? 503 : 500 })
  }
}
