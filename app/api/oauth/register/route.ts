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

function isAllowedChatGPTRedirectUri(value: unknown) {
  if (typeof value !== "string") return false
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return false
    if (url.hostname === "chatgpt.com") {
      return (
        url.pathname === "/connector_platform_oauth_redirect" ||
        /^\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(url.pathname)
      )
    }
    return url.hostname === "connectors.api.openai.com" && url.pathname === "/connector/oauth_callback/ios_relay"
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const redirects = body && typeof body === "object" && Array.isArray((body as { redirect_uris?: unknown }).redirect_uris)
      ? (body as { redirect_uris: unknown[] }).redirect_uris
      : null
    if (!redirects || redirects.length < 1 || !redirects.every(isAllowedChatGPTRedirectUri)) {
      return json({ error: "invalid_client_metadata", error_description: "OVERMIND_OAUTH_REDIRECT_URI_REJECTED" }, 400)
    }
    return json(await registerOvermindOAuthClient(body), 201)
  } catch (error) {
    const code = error instanceof ZodError ? "invalid_client_metadata" : error instanceof Error ? error.message : "invalid_client_metadata"
    return json({ error: "invalid_client_metadata", error_description: code }, 400)
  }
}
