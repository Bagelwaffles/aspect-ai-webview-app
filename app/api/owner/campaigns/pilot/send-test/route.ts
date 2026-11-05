import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import {
  dispatchOwnerCampaignPilot,
  ownerCampaignPilotSendingAllowed,
} from "@/lib/server/owner-campaign-pilot"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const inputSchema = z.object({
  id: z.string().uuid(),
  confirmation: z.literal("AUTHORIZE_SINGLE_OWNER_PREVIEW_TEST"),
}).strict()
function result(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

/** Explicit owner-initiated test only; never a production or public send route. */
export async function POST(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return result({ ok: false }, 404)
  const auth = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!auth.ok) return result({ ok: false, code: auth.code }, auth.status)
  const input = inputSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return result({ ok: false, code: "PILOT_SEND_CONFIRMATION_REQUIRED" }, 400)
  if (!ownerCampaignPilotSendingAllowed()) {
    return result({ ok: false, code: "PILOT_SEND_DISABLED" }, 503)
  }
  try {
    const dispatch = await dispatchOwnerCampaignPilot(input.data.id)
    return result({
      ok: dispatch.status === "accepted",
      status: dispatch.status,
      ...(dispatch.step === undefined ? {} : { step: dispatch.step }),
    }, dispatch.status === "accepted" ? 200 : 409)
  } catch {
    // Do not leak provider details or authorization information.
    return result({ ok: false, code: "PILOT_DELIVERY_UNCONFIRMED" }, 503)
  }
}
