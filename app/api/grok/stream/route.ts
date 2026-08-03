import { NextRequest, NextResponse } from "next/server"

import { authorizePaidApiRequest } from "@/lib/server/customer-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type GrokStreamDependencies = {
  authorize: typeof authorizePaidApiRequest
}

type GrokStreamTestGlobals = typeof globalThis & {
  __amsGrokStreamTestDependencies?: Partial<GrokStreamDependencies>
}

function testDependencies(): Partial<GrokStreamDependencies> {
  if (process.env.NODE_ENV === "production") return {}
  return (globalThis as GrokStreamTestGlobals).__amsGrokStreamTestDependencies ?? {}
}

function createGrokStreamHandler(overrides: Partial<GrokStreamDependencies> = {}) {
  const dependencies: GrokStreamDependencies = {
    authorize: authorizePaidApiRequest,
    ...overrides,
  }

  return async function POST(request: NextRequest) {
    const principal = await dependencies.authorize(request)
    if (!principal || principal.kind !== "customer") {
      return NextResponse.json(
        { ok: false, error: "A customer session is required", code: "CUSTOMER_SESSION_REQUIRED" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      )
    }

    return NextResponse.json(
      {
        ok: false,
        error: "Streaming is disabled until credit commit and refund semantics are proven",
        code: "STREAMING_NOT_IMPLEMENTED",
      },
      { status: 501, headers: { "Cache-Control": "no-store" } },
    )
  }
}

export async function POST(request: NextRequest) {
  return createGrokStreamHandler(testDependencies())(request)
}
