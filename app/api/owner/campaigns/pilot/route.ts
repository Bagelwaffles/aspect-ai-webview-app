import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { getContentAgentRunStore } from "@/lib/server/content-agent-runs"
import {
  changeOwnerCampaignPilot,
  createOwnerCampaignPilot,
  ownerCampaignPilotInputSchema,
  ownerCampaignPilotSendingAllowed,
  readOwnerCampaignPilot,
} from "@/lib/server/owner-campaign-pilot"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })

export async function GET(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request)
  if (!auth.ok) return json({ ok: false, code: auth.code }, auth.status)
  const parsed = z.string().uuid().safeParse(request.nextUrl.searchParams.get("id"))
  if (!parsed.success) return json({ ok: false, code: "CAMPAIGN_ID_REQUIRED" }, 400)
  try {
    const record = await readOwnerCampaignPilot(parsed.data)
    return json({ ok: Boolean(record), record, enabled: ownerCampaignPilotSendingAllowed() }, record ? 200 : 404)
  } catch { return json({ ok: false, code: "CAMPAIGN_UNAVAILABLE" }, 503) }
}

export async function POST(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!auth.ok) return json({ ok: false, code: auth.code }, auth.status)
  const parsed = ownerCampaignPilotInputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ ok: false, code: "CAMPAIGN_INPUT_INVALID" }, 400)
  try {
    const runs = await getContentAgentRunStore().listForOwner(auth.principal.subject, 20)
    const source = runs.find(run => run.id === parsed.data.sourceRunId)
    if (!source || source.status !== "succeeded" || source.creditState !== "committed" ||
      source.input.channel !== "email" || !source.output) {
      return json({ ok: false, code: "OWNED_EMAIL_GENERATION_REQUIRED" }, 404)
    }
    const saved = await createOwnerCampaignPilot(parsed.data)
    return json({ ok: true, created: saved.created, record: saved.record }, saved.created ? 201 : 200)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("CAMPAIGN_")) {
      return json({ ok: false, code: error.message }, 409)
    }
    return json({ ok: false, code: "CAMPAIGN_UNAVAILABLE" }, 503)
  }
}

const actionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "stop"]),
  reviewed: z.literal(true).optional(),
}).strict()

export async function PATCH(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!auth.ok) return json({ ok: false, code: auth.code }, auth.status)
  const parsed = actionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success || parsed.data.action === "approve" && parsed.data.reviewed !== true) {
    return json({ ok: false, code: "CAMPAIGN_REVIEW_REQUIRED" }, 400)
  }
  try {
    const record = await changeOwnerCampaignPilot(parsed.data.id, parsed.data.action)
    return json({ ok: true, record })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("CAMPAIGN_")) {
      return json({ ok: false, code: error.message }, 409)
    }
    return json({ ok: false, code: "CAMPAIGN_UNAVAILABLE" }, 503)
  }
}
