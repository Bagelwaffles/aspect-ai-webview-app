import { NextRequest, NextResponse } from "next/server"

import { authorizeCustomerApiRequest } from "@/lib/server/customer-api-auth"
import {
  buildGoogleDriveAuthorizationUrl,
  createGoogleDriveOauthAttempt,
  GOOGLE_DRIVE_OAUTH_COOKIE,
  isGoogleDriveConnectorConfigured,
} from "@/lib/server/google-drive-connection"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function workspaceUrl(request: NextRequest, state: string) {
  const url = new URL("/workspace", request.url)
  url.searchParams.set("googleDrive", state)
  return url
}

export async function GET(request: NextRequest) {
  const principal = await authorizeCustomerApiRequest(request)
  if (!principal || principal.kind !== "customer") {
    const login = new URL("/login", request.url)
    login.searchParams.set("callbackUrl", "/workspace")
    return NextResponse.redirect(login)
  }

  if (!isGoogleDriveConnectorConfigured()) {
    return NextResponse.redirect(workspaceUrl(request, "setup-required"))
  }

  try {
    const attempt = createGoogleDriveOauthAttempt(principal.subject)
    const response = NextResponse.redirect(buildGoogleDriveAuthorizationUrl(attempt))
    response.cookies.set(GOOGLE_DRIVE_OAUTH_COOKIE, attempt.cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: attempt.maxAgeSeconds,
    })
    response.headers.set("Cache-Control", "no-store")
    return response
  } catch {
    return NextResponse.redirect(workspaceUrl(request, "unavailable"))
  }
}
