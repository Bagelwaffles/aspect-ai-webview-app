import { NextResponse } from "next/server"

const DEFAULT_REVIEWER_EMAIL = "play-reviewer@aspectmarketingsolutions.app"

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

export async function POST(request: Request) {
  const expectedCode = normalize(process.env.AMS_REVIEWER_ACCESS_CODE)
  const expectedEmail = normalize(process.env.AMS_REVIEWER_ACCESS_EMAIL) || DEFAULT_REVIEWER_EMAIL

  if (!expectedCode) {
    return NextResponse.json(
      { ok: false, error: "reviewer_access_not_configured" },
      { status: 503 }
    )
  }

  const body = await request.json().catch(() => null)
  const reviewerEmail = normalize(body?.email)
  const reviewerCode = normalize(body?.code)

  if (!reviewerEmail || !reviewerCode) {
    return NextResponse.json(
      { ok: false, error: "email_and_code_required" },
      { status: 400 }
    )
  }

  if (reviewerEmail.toLowerCase() !== expectedEmail.toLowerCase() || reviewerCode !== expectedCode) {
    return NextResponse.json({ ok: false, error: "invalid_reviewer_credentials" }, { status: 401 })
  }

  const response = NextResponse.json({
    ok: true,
    reviewerEmail: expectedEmail,
    organizationSlug: "ams-play-review-org",
    accessScope: ["home", "pricing", "billing", "billing-success", "workflows", "content-agent"]
  })

  response.cookies.set("ams_reviewer_access", "verified", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  })
  response.cookies.set("ams_reviewer_email", expectedEmail, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  })

  return response
}
