import { NextRequest, NextResponse } from "next/server"

import {
  exchangeOvermindAuthorizationCode,
  refreshOvermindAccessToken,
} from "@/lib/server/overmind-oauth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", Pragma: "no-cache", "X-Content-Type-Options": "nosniff" },
  })
}

function text(form: FormData, key: string) {
  const value = form.get(key)
  return typeof value === "string" ? value : ""
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()
    const grantType = text(form, "grant_type")

    if (grantType === "authorization_code") {
      const result = await exchangeOvermindAuthorizationCode({
        code: text(form, "code"),
        clientId: text(form, "client_id"),
        redirectUri: text(form, "redirect_uri"),
        codeVerifier: text(form, "code_verifier"),
        resource: text(form, "resource"),
      })
      return json(result)
    }

    if (grantType === "refresh_token") {
      const result = await refreshOvermindAccessToken({
        refreshToken: text(form, "refresh_token"),
        clientId: text(form, "client_id"),
        resource: text(form, "resource"),
        scope: text(form, "scope") || undefined,
      })
      return json(result)
    }

    return json({ error: "unsupported_grant_type" }, 400)
  } catch (error) {
    const description = error instanceof Error ? error.message : "OVERMIND_OAUTH_TOKEN_FAILED"
    return json({ error: "invalid_grant", error_description: description }, 400)
  }
}
