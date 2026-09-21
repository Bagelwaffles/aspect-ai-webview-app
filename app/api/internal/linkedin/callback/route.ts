import { NextRequest, NextResponse } from "next/server"

import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import {
  exchangeLinkedInAuthorizationCode,
  LINKEDIN_OAUTH_COOKIE,
  readLinkedInOauthAttempt,
} from "@/lib/server/linkedin-organization-connection"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function dashboardRedirect(request: NextRequest, state: string) {
  const url = new URL("/dashboard/social-publisher", request.url)
  url.searchParams.set("linkedin", state)
  const response = NextResponse.redirect(url)
  response.cookies.set(LINKEDIN_OAUTH_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
  response.headers.set("Cache-Control", "no-store")
  return response
}

export async function GET(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request)
  if (!auth.ok) return dashboardRedirect(request, "owner-session-required")

  if (request.nextUrl.searchParams.get("error")) {
    return dashboardRedirect(request, "denied")
  }

  const code = request.nextUrl.searchParams.get("code")
  const state = request.nextUrl.searchParams.get("state")
  if (!code || !state) return dashboardRedirect(request, "invalid-callback")

  try {
    readLinkedInOauthAttempt(
      request.cookies.get(LINKEDIN_OAUTH_COOKIE)?.value,
      state,
    )
    const connection = await exchangeLinkedInAuthorizationCode(code)
    console.info("LINKEDIN_ORGANIZATION_OAUTH_CONNECTED", {
      organizationUrn: connection.organizationUrn,
      scopes: connection.scopes,
    })
    return dashboardRedirect(request, "connected")
  } catch (error) {
    const codeValue = error instanceof Error ? error.message : "LINKEDIN_CONNECTION_FAILED"
    console.warn("LINKEDIN_ORGANIZATION_OAUTH_FAILED", { code: codeValue })
    const stateValue =
      codeValue === "LINKEDIN_OAUTH_STATE_EXPIRED"
        ? "expired"
        : codeValue === "LINKEDIN_ORGANIZATION_ADMIN_REQUIRED"
          ? "admin-required"
          : codeValue.startsWith("LINKEDIN_ADMIN_VALIDATION_FAILED")
            ? "admin-validation-failed"
            : codeValue.startsWith("LINKEDIN_TOKEN_EXCHANGE_FAILED")
              ? "token-exchange-failed"
              : "connection-failed"
    return dashboardRedirect(request, stateValue)
  }
}
