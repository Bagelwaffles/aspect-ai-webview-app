import { NextResponse } from "next/server"

import {
  createInternalAdminCookie,
  isValidInternalAdminSessionSecret,
} from "@/app/lib/internal-admin-cookie"
import {
  createInternalAdminLoginThrottle,
  internalAdminLoginIdentity,
  isSupportedInternalAdminPasswordHash,
  verifyInternalAdminPassword,
} from "@/lib/server/internal-admin-security"

export const runtime = "nodejs"

const DEFAULT_ADMIN_EMAIL = "internal-admin@aspectmarketingsolutions.app"

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : ""
}

function unavailable(error: string) {
  return NextResponse.json(
    { ok: false, error },
    { status: 503, headers: { "cache-control": "no-store" } },
  )
}

export async function POST(request: Request) {
  const expectedPasswordHash = normalize(process.env.INTERNAL_ADMIN_PASSWORD_HASH)
  const sessionSecret = normalize(process.env.INTERNAL_ADMIN_SECRET)
  const expectedEmail = normalize(process.env.INTERNAL_ADMIN_EMAIL) || DEFAULT_ADMIN_EMAIL

  if (
    !isSupportedInternalAdminPasswordHash(expectedPasswordHash) ||
    !isValidInternalAdminSessionSecret(sessionSecret)
  ) {
    return unavailable("internal_admin_access_not_configured")
  }

  const body = await request.json().catch(() => null)
  const adminEmail = normalize(body?.email)
  const adminPassword = stringValue(body?.password)

  if (!adminEmail || !adminPassword) {
    return NextResponse.json(
      { ok: false, error: "email_and_password_required" },
      { status: 400, headers: { "cache-control": "no-store" } },
    )
  }

  const throttle = createInternalAdminLoginThrottle()
  if (!throttle) {
    return unavailable("internal_admin_login_throttle_unavailable")
  }

  const loginIdentity = internalAdminLoginIdentity(request)
  const reservation = await throttle.reserve(loginIdentity)
  if (!reservation.available) {
    return unavailable("internal_admin_login_throttle_unavailable")
  }

  if (!reservation.allowed) {
    return NextResponse.json(
      { ok: false, error: "internal_admin_login_rate_limited" },
      {
        status: 429,
        headers: {
          "cache-control": "no-store",
          "retry-after": String(reservation.retryAfterSeconds),
        },
      },
    )
  }

  const passwordMatches = await verifyInternalAdminPassword(adminPassword, expectedPasswordHash)
  const emailMatches = adminEmail.toLowerCase() === expectedEmail.toLowerCase()
  if (!emailMatches || !passwordMatches) {
    return NextResponse.json(
      { ok: false, error: "invalid_admin_credentials" },
      { status: 401, headers: { "cache-control": "no-store" } },
    )
  }

  if (!(await throttle.release(loginIdentity))) {
    return unavailable("internal_admin_login_throttle_unavailable")
  }

  const adminToken = await createInternalAdminCookie(expectedEmail, sessionSecret)
  const response = NextResponse.json({
    ok: true,
    adminEmail: expectedEmail,
    accessScope: ["admin", "ethical-agent-farm-requests"],
  })

  response.headers.set("cache-control", "no-store")
  response.cookies.set("ams_internal_admin_access", adminToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  })
  response.cookies.set("ams_internal_admin_email", expectedEmail, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  })

  return response
}
