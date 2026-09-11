import { NextRequest, NextResponse } from "next/server"

import { registerOvermindOAuthClient } from "@/lib/server/overmind-mcp-oauth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const client = await registerOvermindOAuthClient(body ?? {})
    return NextResponse.json(client, {
      status: 201,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    })
  } catch (error) {
    const code = error instanceof Error ? error.message : "OVERMIND_OAUTH_REGISTRATION_FAILED"
    const invalidMetadata =
      code.includes("REDIRECT") || code.includes("GRANT") || code.includes("Zod") || code.includes("CLIENT")
    return NextResponse.json(
      {
        error: invalidMetadata ? "invalid_client_metadata" : "server_error",
        error_description: code,
      },
      {
        status: invalidMetadata ? 400 : 503,
        headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
      },
    )
  }
}
