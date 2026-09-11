import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"

import { registerOvermindOAuthClient } from "@/lib/server/overmind-oauth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  })
}

export async function POST(request: NextRequest) {
  try {
    return json(await registerOvermindOAuthClient(await request.json()), 201)
  } catch (error) {
    const code = error instanceof ZodError ? "invalid_client_metadata" : error instanceof Error ? error.message : "invalid_client_metadata"
    return json({ error: "invalid_client_metadata", error_description: code }, 400)
  }
}
