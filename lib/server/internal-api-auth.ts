import { timingSafeEqual } from "node:crypto"
import type { NextRequest } from "next/server"

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

export function isInternalApiAuthorized(request: NextRequest): boolean {
  const expected = process.env.AMS_INTERNAL_API_KEY?.trim()
  if (!expected) {
    return false
  }

  const authorization = request.headers.get("authorization")?.trim()
  if (!authorization?.startsWith("Bearer ")) {
    return false
  }

  const supplied = authorization.slice("Bearer ".length).trim()
  return supplied.length > 0 && constantTimeEqual(supplied, expected)
}

export function unauthorizedInternalApiResponse(): Response {
  return Response.json(
    {
      ok: false,
      error: "Unauthorized",
      code: "INTERNAL_API_AUTH_REQUIRED",
    },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  )
}
