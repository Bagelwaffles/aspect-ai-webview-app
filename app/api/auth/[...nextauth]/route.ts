import NextAuth from "next-auth"

import { authOptions } from "@/lib/auth"
import {
  authCallbackUrlFromRequest,
  isSafeAuthCallbackUrl,
  recordInvalidAuthAttempt,
} from "@/lib/server/auth-request-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const nextAuthHandler = NextAuth(authOptions)

async function handler(request: Request) {
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

  return nextAuthHandler(request)
}

export { handler as GET, handler as POST }
