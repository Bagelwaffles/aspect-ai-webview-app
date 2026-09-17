import { NextRequest, NextResponse } from "next/server"

import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import {
  exchangeTwitchAuthorizationCode,
  readTwitchOauthAttempt,
  TWITCH_OAUTH_COOKIE,
} from "@/lib/server/twitch-pilot"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function creatorRedirect(request: NextRequest, state: string) {
  const url = new URL("/creators", request.url)
  url.searchParams.set("twitch", state)
  const response = NextResponse.redirect(url)
  response.cookies.set(TWITCH_OAUTH_COOKIE, "", {
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
  if (!auth.ok) return creatorRedirect(request, "owner-session-required")

  if (request.nextUrl.searchParams.get("error")) {
    return creatorRedirect(request, "denied")
  }

  const code = request.nextUrl.searchParams.get("code")
  const state = request.nextUrl.searchParams.get("state")
  if (!code || !state) return creatorRedirect(request, "invalid-callback")

  try {
    readTwitchOauthAttempt(
      request.cookies.get(TWITCH_OAUTH_COOKIE)?.value,
      state,
    )
    await exchangeTwitchAuthorizationCode(code)
    return creatorRedirect(request, "connected")
  } catch (error) {
    const codeValue = error instanceof Error ? error.message : "TWITCH_CONNECTION_FAILED"
    const stateValue =
      codeValue === "TWITCH_OAUTH_STATE_EXPIRED"
        ? "expired"
        : codeValue === "TWITCH_REQUIRED_SCOPE_MISSING"
          ? "scope-missing"
          : codeValue.startsWith("TWITCH_EVENTSUB_CREATE_FAILED")
            ? "eventsub-failed"
            : "connection-failed"
    return creatorRedirect(request, stateValue)
  }
}
