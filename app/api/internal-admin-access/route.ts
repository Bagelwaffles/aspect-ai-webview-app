import { NextResponse } from "next/server";

import { createInternalAdminCookie } from "@/app/lib/internal-admin-cookie";

const DEFAULT_ADMIN_EMAIL = "internal-admin@aspectmarketingsolutions.app";

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const expectedCode = normalize(process.env.INTERNAL_ADMIN_SECRET);
  const expectedEmail = normalize(process.env.INTERNAL_ADMIN_EMAIL) || DEFAULT_ADMIN_EMAIL;

  if (!expectedCode) {
    return NextResponse.json({ ok: false, error: "internal_admin_access_not_configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const adminEmail = normalize(body?.email);
  const adminCode = normalize(body?.code);

  if (!adminEmail || !adminCode) {
    return NextResponse.json({ ok: false, error: "email_and_code_required" }, { status: 400 });
  }

  if (adminEmail.toLowerCase() !== expectedEmail.toLowerCase() || adminCode !== expectedCode) {
    return NextResponse.json({ ok: false, error: "invalid_admin_credentials" }, { status: 401 });
  }

  const adminToken = await createInternalAdminCookie(expectedEmail, expectedCode);
  const response = NextResponse.json({
    ok: true,
    adminEmail: expectedEmail,
    accessScope: ["admin", "ethical-agent-farm-requests"]
  });

  response.cookies.set("ams_internal_admin_access", adminToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8
  });
  response.cookies.set("ams_internal_admin_email", expectedEmail, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8
  });

  return response;
}
