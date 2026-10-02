import { NextRequest, NextResponse } from "next/server"

import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import {
  exchangeTwitchAuthorizationCode,
  readTwitchOauthAttempt,
  TWITCH_BROADCAST_SCOPE,
  TWITCH_MEDIA_SCOPE,
  TWITCH_OAUTH_COOKIE,
  TWITCH_SCOPE,
} from "@/lib/server/twitch-pilot"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function creatorRedirect(request: NextRequest, state: string) {
  const url = new URL("/creators/twitch", request.url)
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
    const attempt = readTwitchOauthAttempt(
      request.cookies.get(TWITCH_OAUTH_COOKIE)?.value,
      state,
    )
    const result = await exchangeTwitchAuthorizationCode(
      code,
      {},
      attempt.capability === "creator"
        ? [TWITCH_SCOPE, TWITCH_MEDIA_SCOPE, TWITCH_BROADCAST_SCOPE]
        : attempt.capability === "media"
          ? [TWITCH_SCOPE, TWITCH_MEDIA_SCOPE]
          : [TWITCH_SCOPE],
    )
    console.info("TWITCH_OAUTH_CALLBACK_SUCCESS", {
      capability: attempt.capability,
      scopes: result.connection.scopes,
    })
    return creatorRedirect(
      request,
      attempt.capability === "creator"
        ? "creator-enabled"
        : attempt.capability === "media"
          ? "media-enabled"
          : "connected",
    )
  } catch (error) {
    const codeValue = error instanceof Error ? error.message : "TWITCH_CONNECTION_FAILED"
    console.warn("TWITCH_OAUTH_CALLBACK_FAILED", { code: codeValue })
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
