import { NextResponse } from "next/server"

import { oauthProtectedResourceMetadata } from "@/lib/server/overmind-mcp-oauth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json(oauthProtectedResourceMetadata(), {
    status: 200,
    headers: { "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" },
  })
}
