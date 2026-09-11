import { NextRequest, NextResponse } from "next/server"

import { authorizeCustomerApiRequest } from "@/lib/server/customer-api-auth"
import {
  exchangeGoogleDriveAuthorizationCode,
  GOOGLE_DRIVE_OAUTH_COOKIE,
  readGoogleDriveOauthAttempt,
} from "@/lib/server/google-drive-connection"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function workspaceRedirect(request: NextRequest, state: string) {
  const url = new URL("/workspace", request.url)
  url.searchParams.set("googleDrive", state)
  const response = NextResponse.redirect(url)
  response.cookies.set(GOOGLE_DRIVE_OAUTH_COOKIE, "", {
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
  const principal = await authorizeCustomerApiRequest(request)
  if (!principal || principal.kind !== "customer") {
    return workspaceRedirect(request, "session-required")
  }

  const providerError = request.nextUrl.searchParams.get("error")
  if (providerError) return workspaceRedirect(request, "denied")

  const code = request.nextUrl.searchParams.get("code")
  const state = request.nextUrl.searchParams.get("state")
  if (!code || !state) return workspaceRedirect(request, "invalid-callback")

  try {
    const attempt = readGoogleDriveOauthAttempt(
      request.cookies.get(GOOGLE_DRIVE_OAUTH_COOKIE)?.value,
      principal.subject,
      state,
    )
    await exchangeGoogleDriveAuthorizationCode(principal.subject, code, attempt.codeVerifier)
    return workspaceRedirect(request, "connected")
  } catch (error) {
    const code = error instanceof Error ? error.message : "GOOGLE_DRIVE_CONNECTION_FAILED"
    const stateValue =
      code === "GOOGLE_DRIVE_OAUTH_STATE_EXPIRED"
        ? "expired"
        : code === "GOOGLE_DRIVE_REQUIRED_SCOPE_MISSING"
          ? "scope-missing"
          : code === "GOOGLE_DRIVE_REFRESH_TOKEN_MISSING"
            ? "reauthorize"
            : "connection-failed"
    return workspaceRedirect(request, stateValue)
  }
}
