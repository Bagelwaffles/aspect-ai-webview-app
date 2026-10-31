/** Owner-authenticated no-send, no-payment Redis write permission test. */
import { NextRequest, NextResponse } from "next/server"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { probeBuyerLinkRedisWrite } from "@/lib/server/quick-audit-buyer-link-redis-probe"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function reply(code: string, status: number) {
  return NextResponse.json({ ok: status === 200, code }, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow, noarchive" },
  })
}

export async function POST(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!auth.ok) return reply(auth.code, auth.status)
  const result = await probeBuyerLinkRedisWrite()
  return reply(result.code, result.ok ? 200 : 503)
}

export async function GET() {
  return reply("BUYER_LINK_REDIS_PROBE_POST_ONLY", 405)
}
