import { NextResponse, type NextRequest } from "next/server"

export function constantTimeStringEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false
  }

  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }

  return mismatch === 0
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
  return supplied.length > 0 && constantTimeStringEqual(supplied, expected)
}

export function unauthorizedInternalApiResponse(): Response {
  return NextResponse.json(
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
