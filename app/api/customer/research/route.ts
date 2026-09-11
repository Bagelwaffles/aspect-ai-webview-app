import { NextRequest, NextResponse } from "next/server"

import { authorizeCustomerApiRequest } from "@/lib/server/customer-api-auth"
import { liveResearchInputSchema, runLiveResearch } from "@/lib/server/live-research"
import { consumeDistributedAiRateLimit } from "@/lib/server/rate-limit"
import { requestHasTrustedAppOrigin } from "@/lib/server/request-origin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: Record<string, unknown>, status = 200, headers?: HeadersInit) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  })
}

export async function POST(request: NextRequest) {
  if (!requestHasTrustedAppOrigin(request)) {
    return json({ ok: false, code: "UNTRUSTED_ORIGIN" }, 403)
  }

  const principal = await authorizeCustomerApiRequest(request)
  if (!principal || principal.kind !== "customer") {
    return json({ ok: false, code: "CUSTOMER_SESSION_REQUIRED" }, 401)
  }

  const parsed = liveResearchInputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return json({ ok: false, code: "INVALID_RESEARCH_REQUEST", error: "Research query was not accepted" }, 400)
  }

  const limit = await consumeDistributedAiRateLimit({
    subject: principal.subject,
    operation: "live-research",
    limit: 5,
    windowMs: 60_000,
  })
  if (!limit.available) {
    return json({ ok: false, code: "RATE_LIMIT_UNAVAILABLE", error: "Research rate limit is unavailable" }, 503)
  }
  if (!limit.allowed) {
    return json(
      { ok: false, code: "LIVE_RESEARCH_RATE_LIMITED", error: "Too many research requests" },
      429,
      { "Retry-After": String(limit.retryAfterSeconds) },
    )
  }

  try {
    const result = await runLiveResearch(parsed.data)
    return json({ ok: true, research: result })
  } catch (error) {
    const code = error instanceof Error ? error.message : "LIVE_RESEARCH_FAILED"
    if (code === "LIVE_RESEARCH_NOT_CONFIGURED") {
      return json({ ok: false, code, error: "Live research is not configured" }, 503)
    }
    if (code === "LIVE_RESEARCH_USAGE_LIMIT") {
      return json({ ok: false, code, error: "Live research provider limit was reached" }, 503)
    }
    if (code === "LIVE_RESEARCH_AUTH_FAILED") {
      return json({ ok: false, code, error: "Live research provider authentication failed" }, 503)
    }
    return json({ ok: false, code: "LIVE_RESEARCH_FAILED", error: "Live research failed" }, 502)
  }
}
