import { NextRequest, NextResponse } from "next/server"

import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import {
  buildLinkedInAuthorizationUrl,
  createLinkedInOauthAttempt,
  isLinkedInOrganizationOAuthConfigured,
  LINKEDIN_OAUTH_COOKIE,
} from "@/lib/server/linkedin-organization-connection"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function dashboardUrl(request: NextRequest, state: string) {
  const url = new URL("/dashboard/social-publisher", request.url)
  url.searchParams.set("linkedin", state)
  return url
}

export async function GET(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request)
  if (!auth.ok) {
    const login = new URL("/login", request.url)
    login.searchParams.set("callbackUrl", "/api/internal/linkedin/start")
    return NextResponse.redirect(login)
  }

  if (!isLinkedInOrganizationOAuthConfigured()) {
    return NextResponse.redirect(dashboardUrl(request, "setup-required"))
  }

  try {
    const attempt = createLinkedInOauthAttempt()
    const response = NextResponse.redirect(buildLinkedInAuthorizationUrl(attempt.state))
    response.cookies.set(LINKEDIN_OAUTH_COOKIE, attempt.cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: attempt.maxAgeSeconds,
    })
    response.headers.set("Cache-Control", "no-store")
    return response
  } catch {
    return NextResponse.redirect(dashboardUrl(request, "unavailable"))
  }
}
