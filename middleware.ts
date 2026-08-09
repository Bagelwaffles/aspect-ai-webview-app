import { NextRequest, NextResponse } from "next/server";

import { verifyInternalAdminCookie } from "@/app/lib/internal-admin-cookie";

export async function middleware(request: NextRequest) {
  if (
    request.nextUrl.pathname === "/login" &&
    request.nextUrl.searchParams.get("next") === "/dashboard"
  ) {
    const adminLoginUrl = new URL("/admin/login", request.url);
    adminLoginUrl.searchParams.set("next", "/dashboard");
    return NextResponse.redirect(adminLoginUrl);
  }

  const requiresInternalAdmin =
    request.nextUrl.pathname === "/dashboard" ||
    request.nextUrl.pathname.startsWith("/dashboard/") ||
    request.nextUrl.pathname === "/admin/ethical-agent-farm-requests";

  if (!requiresInternalAdmin) {
    return NextResponse.next();
  }

  const adminAccess = request.cookies.get("ams_internal_admin_access")?.value;
  const expectedSecret = process.env.INTERNAL_ADMIN_SECRET?.trim();
  if (expectedSecret && (await verifyInternalAdminCookie(adminAccess, expectedSecret))) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/admin/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/login", "/dashboard/:path*", "/admin/ethical-agent-farm-requests"]
};
