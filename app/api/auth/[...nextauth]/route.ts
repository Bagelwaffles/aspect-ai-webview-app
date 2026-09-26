import NextAuth from "next-auth"

import { authOptions } from "@/lib/auth"
import { shouldBlockGoogleNextAuthExchange } from "@/lib/auth-origin"
import {
  authCallbackUrlFromRequest,
  isSafeAuthCallbackUrl,
  recordInvalidAuthAttempt,
} from "@/lib/server/auth-request-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const nextAuthHandler = NextAuth(authOptions)

type AuthRouteContext = {
  params: Promise<{ nextauth: string[] }>
}

async function handler(request: Request, context: AuthRouteContext) {
  const requestUrl = new URL(request.url)
  if (
    shouldBlockGoogleNextAuthExchange(
      requestUrl.pathname,
      request.url,
      request.headers,
    )
  ) {
    return Response.json(
      {
        error: "Google sign-in is unavailable on this deployment origin.",
        code: "AUTH_ORIGIN_MISMATCH",
      },
      {
        status: 409,
        headers: { "cache-control": "no-store" },
      },
    )
  }

  const callbackUrl = await authCallbackUrlFromRequest(request)

  if (callbackUrl !== null && !isSafeAuthCallbackUrl(callbackUrl, request.url)) {
    const rateLimit = recordInvalidAuthAttempt(request)

    return Response.json(
      {
        error: rateLimit.blocked ? "Too many invalid authentication requests" : "Invalid callback URL",
      },
      {
        status: rateLimit.blocked ? 429 : 400,
        headers: {
          "cache-control": "no-store",
          ...(rateLimit.blocked
            ? { "retry-after": String(rateLimit.retryAfterSeconds) }
            : {}),
        },
      },
    )
  }

  return nextAuthHandler(request, context)
}

export { handler as GET, handler as POST }
