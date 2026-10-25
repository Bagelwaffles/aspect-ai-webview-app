import { getToken } from "next-auth/jwt";
import { classifyPilotIngressRequest } from "@/lib/server/quick-audit-stripe-pilot-host-policy";
import { NextRequest, NextResponse } from "next/server";

import {
  createInternalAdminCookie,
  verifyInternalAdminCookie,
} from "@/app/lib/internal-admin-cookie";
import { configuredOperatorOwnerEmail, isOperatorOwnerEmail } from "@/lib/operator-owner";

const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export async function middleware(request: NextRequest) {
  // Vercel exceptions are hostname-wide. This guard must run before every
  // other route, including owner auth, Next assets and dashboard pages.
  const pilotIngress = classifyPilotIngressRequest({
    hostHeader: request.headers.get("host"),
    urlHostname: request.nextUrl.hostname,
    method: request.method,
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    vercelEnvironment: process.env.VERCEL_ENV,
    gitBranch: process.env.VERCEL_GIT_COMMIT_REF,
  });
  if (pilotIngress === "deny") {
    return new NextResponse(null, {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }
  if (pilotIngress === "allow") return NextResponse.next();

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

  const ownerEmail = configuredOperatorOwnerEmail();
  const nextAuthSecret = process.env.NEXTAUTH_SECRET?.trim();
  if (ownerEmail && nextAuthSecret) {
    const token = await getToken({ req: request, secret: nextAuthSecret }).catch(() => null);
    if (isOperatorOwnerEmail(token?.email)) {
      if (!expectedSecret) {
        const configurationUrl = new URL("/admin/login", request.url);
        configurationUrl.searchParams.set("next", request.nextUrl.pathname);
        configurationUrl.searchParams.set("error", "owner_session_not_configured");
        return NextResponse.redirect(configurationUrl);
      }

      const adminToken = await createInternalAdminCookie(ownerEmail, expectedSecret);
      const retryUrl = new URL(request.nextUrl.pathname + request.nextUrl.search, request.url);
      const response = NextResponse.redirect(retryUrl);
      response.cookies.set("ams_internal_admin_access", adminToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
        maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
      });
      response.cookies.set("ams_internal_admin_email", ownerEmail, {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
        maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
      });
      return response;
    }

    if (token?.email) {
      const deniedUrl = new URL("/", request.url);
      deniedUrl.searchParams.set("operatorAccess", "denied");
      return NextResponse.redirect(deniedUrl);
    }
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Intentionally match ALL paths so the dedicated Preview hostname cannot
  // expose auth routes, application pages or framework assets through a
  // hostname-wide Deployment Protection Exception.
  matcher: ["/:path*"]
};
