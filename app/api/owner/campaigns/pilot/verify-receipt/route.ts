import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { verifyOwnerCampaignPilotReceipt } from "@/lib/server/owner-campaign-pilot"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function reply(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

/** Owner-only metadata check. Never initiates a Gmail send or reply. */
export async function POST(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return reply({ ok: false }, 404)
  const auth = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!auth.ok) return reply({ ok: false, code: auth.code }, auth.status)
  const input = z.object({ id: z.string().uuid() }).strict()
    .safeParse(await request.json().catch(() => null))
  if (!input.success) return reply({ ok: false, code: "CAMPAIGN_ID_REQUIRED" }, 400)
  try {
    const result = await verifyOwnerCampaignPilotReceipt(input.data.id)
    return reply({
      ok: result.status === "delivered",
      status: result.status,
      ...("step" in result ? { step: result.step } : {}),
    }, result.status === "delivered" ? 200 : 409)
  } catch {
    return reply({ ok: false, code: "CAMPAIGN_RECEIPT_UNAVAILABLE" }, 503)
  }
}
