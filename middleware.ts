import { NextRequest, NextResponse } from "next/server";

import { verifyInternalAdminCookie } from "@/app/lib/internal-admin-cookie";

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname !== "/admin/ethical-agent-farm-requests") {
    return NextResponse.next();
  }

  const adminAccess = request.cookies.get("ams_internal_admin_access")?.value;
  const expectedSecret = process.env.INTERNAL_ADMIN_SECRET?.trim();
  if (expectedSecret && (await verifyInternalAdminCookie(adminAccess, expectedSecret))) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/admin/login", request.url);
  loginUrl.searchParams.set("next", "/admin/ethical-agent-farm-requests");
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/ethical-agent-farm-requests"]
};
