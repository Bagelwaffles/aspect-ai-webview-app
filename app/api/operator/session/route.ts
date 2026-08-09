import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"

import {
  createInternalAdminCookie,
  isValidInternalAdminSessionSecret,
} from "@/app/lib/internal-admin-cookie"
import { safeRelativeCallbackPath } from "@/app/lib/safe-relative-callback"
import { authOptions } from "@/lib/auth"
import {
  configuredOperatorOwnerEmail,
  isOperatorOwnerEmail,
} from "@/lib/operator-owner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8

function redirectWithNoStore(url: URL) {
  const response = NextResponse.redirect(url)
  response.headers.set("cache-control", "no-store")
  return response
}

export async function GET(request: NextRequest) {
  const nextPath = safeRelativeCallbackPath(
    request.nextUrl.searchParams.get("next"),
    "/dashboard",
  )

  const ownerEmail = configuredOperatorOwnerEmail()
  const sessionSecret = process.env.INTERNAL_ADMIN_SECRET?.trim() ?? ""

  if (!ownerEmail || !isValidInternalAdminSessionSecret(sessionSecret)) {
    const configurationUrl = new URL("/admin/login", request.url)
    configurationUrl.searchParams.set("next", nextPath)
    configurationUrl.searchParams.set("error", "owner_session_not_configured")
    return redirectWithNoStore(configurationUrl)
  }

  const session = await getServerSession(authOptions).catch(() => null)
  const sessionEmail = session?.user?.email

  if (!sessionEmail) {
    const bridgePath = `/api/operator/session?next=${encodeURIComponent(nextPath)}`
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("next", bridgePath)
    return redirectWithNoStore(loginUrl)
  }

  if (!isOperatorOwnerEmail(sessionEmail)) {
    const deniedUrl = new URL("/", request.url)
    deniedUrl.searchParams.set("operatorAccess", "denied")
    return redirectWithNoStore(deniedUrl)
  }

  const adminToken = await createInternalAdminCookie(
    ownerEmail,
    sessionSecret,
    ADMIN_SESSION_MAX_AGE_SECONDS,
  )

  const destination = new URL(nextPath, request.url)
  const response = redirectWithNoStore(destination)

  response.cookies.set("ams_internal_admin_access", adminToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  })
  response.cookies.set("ams_internal_admin_email", ownerEmail, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  })

  return response
}
