import { NextRequest, NextResponse } from "next/server"

import { revokeOvermindOAuthToken } from "@/lib/server/overmind-mcp-oauth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? ""
  if (!contentType.toLowerCase().includes("application/x-www-form-urlencoded")) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: { "Cache-Control": "no-store" } })
  }
  const form = new URLSearchParams(await request.text())
  const token = form.get("token")?.trim() ?? ""
  if (token) await revokeOvermindOAuthToken(token).catch(() => undefined)
  return new NextResponse(null, {
    status: 200,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  })
}
