import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  isSocialCampaignAgentConfigured,
  runSocialCampaignAgent,
  socialCampaignInputSchema,
} from "@/lib/server/social-campaign-agent"
import {
  createSocialCampaignRecord,
  findSocialCampaignRecordByIdempotencyKey,
  isSocialCampaignStoreConfigured,
  socialCampaignInputFingerprint,
} from "@/lib/server/social-campaign-store"
import { getSocialPublisherConfiguration } from "@/lib/server/social-publisher"
import {
  isInternalApiAuthorized,
  unauthorizedInternalApiResponse,
} from "@/lib/server/internal-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status.ping") }).strict(),
  z
    .object({
      action: z.literal("content.social"),
      payload: socialCampaignInputSchema,
    })
    .strict(),
])

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

function errorJson(status: number, code: string, message: string) {
  return noStoreJson({ ok: false, error: { code, message } }, status)
}

function idempotencyKey(request: NextRequest): string | null {
  const value = request.headers.get("idempotency-key")?.trim()
  if (!value || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/.test(value)) return null
  return value
}

export async function GET(request: NextRequest) {
  if (!isInternalApiAuthorized(request)) return unauthorizedInternalApiResponse()

  return noStoreJson({
    ok: true,
    service: "ams-vercel-agent-orchestrator",
    n8n_required: false,
    social_agent_configured: isSocialCampaignAgentConfigured(),
    social_store_configured: isSocialCampaignStoreConfigured(),
    publishers: getSocialPublisherConfiguration(),
    supported_actions: ["status.ping", "content.social"],
  })
}

export async function POST(request: NextRequest) {
  if (!isInternalApiAuthorized(request)) return unauthorizedInternalApiResponse()

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return errorJson(400, "AMS_AGENT_REQUEST_INVALID", "Unsupported or invalid AMS agent request")
  }

  if (parsed.data.action === "status.ping") {
    return noStoreJson({
      ok: true,
      service: "ams-vercel-agent-orchestrator",
      n8n_required: false,
      social_agent_configured: isSocialCampaignAgentConfigured(),
      social_store_configured: isSocialCampaignStoreConfigured(),
      publishers: getSocialPublisherConfiguration(),
    })
  }

  const key = idempotencyKey(request)
  if (!key) {
    return errorJson(
      400,
      "AMS_IDEMPOTENCY_KEY_REQUIRED",
      "A valid Idempotency-Key header is required for social campaign generation",
    )
  }

  if (!isSocialCampaignStoreConfigured()) {
    return errorJson(503, "SOCIAL_CAMPAIGN_STORE_UNAVAILABLE", "Social campaign storage is not configured")
  }

  try {
    const existing = await findSocialCampaignRecordByIdempotencyKey(key)
    if (existing) {
      const incomingFingerprint = socialCampaignInputFingerprint(parsed.data.payload)
      if (incomingFingerprint !== existing.inputFingerprint) {
        return errorJson(
          409,
          "SOCIAL_CAMPAIGN_IDEMPOTENCY_CONFLICT",
          "The idempotency key is already bound to a different social campaign",
        )
      }
      return noStoreJson({ ok: true, idempotent: true, campaign: existing })
    }
  } catch (error) {
    if (error instanceof Error && error.message === "SOCIAL_CAMPAIGN_INVALID_IDEMPOTENCY_KEY") {
      return errorJson(400, error.message, "The social campaign idempotency key is invalid")
    }
    return errorJson(503, "SOCIAL_CAMPAIGN_STORE_UNAVAILABLE", "Social campaign storage is unavailable")
  }

  if (!isSocialCampaignAgentConfigured()) {
    return errorJson(503, "SOCIAL_CAMPAIGN_AGENT_UNAVAILABLE", "The Vercel social campaign agent is not configured")
  }

  let output
  try {
    output = await runSocialCampaignAgent(parsed.data.payload)
  } catch (error) {
    const code =
      error instanceof Error && error.message === "SOCIAL_CAMPAIGN_CHANNEL_MISMATCH"
        ? error.message
        : "SOCIAL_CAMPAIGN_GENERATION_FAILED"
    return errorJson(502, code, "The social campaign agent could not produce a valid campaign")
  }

  try {
    const stored = await createSocialCampaignRecord({
      idempotencyKey: key,
      campaign: parsed.data.payload,
      output,
    })
    return noStoreJson(
      {
        ok: true,
        idempotent: !stored.created,
        campaign: stored.record,
      },
      stored.created ? 201 : 200,
    )
  } catch (error) {
    if (error instanceof Error && error.message === "SOCIAL_CAMPAIGN_IDEMPOTENCY_CONFLICT") {
      return errorJson(409, error.message, "The idempotency key is already bound to another campaign")
    }
    return errorJson(503, "SOCIAL_CAMPAIGN_STORE_UNAVAILABLE", "The generated campaign could not be persisted")
  }
}
