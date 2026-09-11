import { NextRequest, NextResponse } from "next/server"

import {
  exchangeOvermindAuthorizationCode,
  refreshOvermindAccessToken,
} from "@/lib/server/overmind-mcp-oauth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function oauthJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

function text(form: URLSearchParams, key: string) {
  return form.get(key)?.trim() ?? ""
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? ""
  if (!contentType.toLowerCase().includes("application/x-www-form-urlencoded")) {
    return oauthJson({ error: "invalid_request", error_description: "Form-encoded token request required." }, 400)
  }

  const form = new URLSearchParams(await request.text())
  const grantType = text(form, "grant_type")
  const clientId = text(form, "client_id")
  if (!clientId) return oauthJson({ error: "invalid_client" }, 401)

  try {
    if (grantType === "authorization_code") {
      const code = text(form, "code")
      const redirectUri = text(form, "redirect_uri")
      const codeVerifier = text(form, "code_verifier")
      if (!code || !redirectUri || !codeVerifier) {
        return oauthJson({ error: "invalid_request", error_description: "code, redirect_uri, and code_verifier are required." }, 400)
      }
      const tokens = await exchangeOvermindAuthorizationCode({
        code,
        clientId,
        redirectUri,
        codeVerifier,
        resource: text(form, "resource") || undefined,
      })
      return oauthJson(tokens)
    }

    if (grantType === "refresh_token") {
      const refreshToken = text(form, "refresh_token")
      if (!refreshToken) return oauthJson({ error: "invalid_request", error_description: "refresh_token is required." }, 400)
      const tokens = await refreshOvermindAccessToken({
        refreshToken,
        clientId,
        scope: text(form, "scope") || undefined,
        resource: text(form, "resource") || undefined,
      })
      return oauthJson(tokens)
    }

    return oauthJson({ error: "unsupported_grant_type" }, 400)
  } catch (error) {
    const code = error instanceof Error ? error.message : "OVERMIND_OAUTH_TOKEN_FAILED"
    const invalidClient = code.includes("CLIENT")
    const invalidGrant = code.includes("CODE") || code.includes("PKCE") || code.includes("REFRESH") || code.includes("BINDING")
    const oauthError = invalidClient ? "invalid_client" : invalidGrant ? "invalid_grant" : code.includes("SCOPE") ? "invalid_scope" : "invalid_request"
    return oauthJson({ error: oauthError, error_description: code }, invalidClient ? 401 : 400)
  }
}
