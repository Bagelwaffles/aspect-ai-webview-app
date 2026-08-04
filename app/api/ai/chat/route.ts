import { NextRequest, NextResponse } from "next/server"

import { authorizePaidApiRequest } from "@/lib/server/customer-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type AiChatDependencies = {
  authorize: typeof authorizePaidApiRequest
}

const defaultDependencies: AiChatDependencies = {
  authorize: authorizePaidApiRequest,
}

type AiChatTestGlobals = typeof globalThis & {
  __amsAiChatTestDependencies?: Partial<AiChatDependencies>
}

function testDependencies(): Partial<AiChatDependencies> {
  if (process.env.NODE_ENV === "production") return {}
  return (globalThis as AiChatTestGlobals).__amsAiChatTestDependencies ?? {}
}

function noStoreJson(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

function createAiChatHandler(overrides: Partial<AiChatDependencies> = {}) {
  const dependencies = { ...defaultDependencies, ...overrides }

  return async function POST(request: NextRequest) {
    const principal = await dependencies.authorize(request)
    if (!principal || principal.kind !== "customer") {
      return noStoreJson(
        { ok: false, error: "A customer session is required", code: "CUSTOMER_SESSION_REQUIRED" },
        401,
      )
    }

    return noStoreJson(
      {
        ok: false,
        error: "Legacy AI chat is disabled for launch. Use the saved Content Agent route.",
        code: "LEGACY_AI_ROUTE_DISABLED",
        next: "/content-agent",
      },
      410,
    )
  }
}

export async function POST(request: NextRequest) {
  return createAiChatHandler(testDependencies())(request)
}
