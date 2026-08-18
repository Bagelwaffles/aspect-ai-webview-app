import { NextRequest, NextResponse } from "next/server"

import { browserAdminAuthorized, getBrowserControlSnapshot } from "@/lib/server/browser-control"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  if (!(await browserAdminAuthorized(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const snapshot = await getBrowserControlSnapshot()
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } })
}
