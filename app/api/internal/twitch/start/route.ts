import { NextRequest, NextResponse } from "next/server"

import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import {
  buildTwitchAuthorizationUrl,
  createTwitchOauthAttempt,
  isTwitchPilotConfigured,
  TWITCH_OAUTH_COOKIE,
} from "@/lib/server/twitch-pilot"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function creatorUrl(request: NextRequest, state: string) {
  const url = new URL("/creators", request.url)
  url.searchParams.set("twitch", state)
  return url
}

export async function GET(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request)
  if (!auth.ok) {
    const login = new URL("/login", request.url)
    login.searchParams.set("callbackUrl", "/api/internal/twitch/start")
    return NextResponse.redirect(login)
  }

  if (!isTwitchPilotConfigured()) {
    return NextResponse.redirect(creatorUrl(request, "setup-required"))
  }

  try {
    const attempt = createTwitchOauthAttempt()
    const response = NextResponse.redirect(buildTwitchAuthorizationUrl(attempt.state))
    response.cookies.set(TWITCH_OAUTH_COOKIE, attempt.cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: attempt.maxAgeSeconds,
    })
    response.headers.set("Cache-Control", "no-store")
    return response
  } catch {
    return NextResponse.redirect(creatorUrl(request, "unavailable"))
  }
}
