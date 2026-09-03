import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  approveSocialCampaignRecord,
  claimSocialCampaignDelivery,
  getSocialCampaignRecord,
  listSocialCampaignRecords,
  releaseSocialCampaignDeliveryClaim,
  updateSocialCampaignDelivery,
} from "@/lib/server/social-campaign-store"
import { socialChannelSchema } from "@/lib/server/social-campaign-agent"
import {
  getSocialPublisherConfiguration,
  publishSocialChannel,
  type SocialPublisherResult,
} from "@/lib/server/social-publisher"
import {
  isInternalApiAuthorized,
  unauthorizedInternalApiResponse,
} from "@/lib/server/internal-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), campaignId: z.string().min(20).max(120) }).strict(),
  z
    .object({
      action: z.literal("publish"),
      campaignId: z.string().min(20).max(120),
      channels: z.array(socialChannelSchema).min(1).max(5).optional(),
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

function campaignError(error: unknown) {
  const code = error instanceof Error ? error.message : "SOCIAL_CAMPAIGN_OPERATION_FAILED"
  if (code === "SOCIAL_CAMPAIGN_NOT_FOUND") {
    return errorJson(404, code, "Social campaign was not found")
  }
  if (code === "SOCIAL_CAMPAIGN_NOT_DRAFT") {
    return errorJson(409, code, "Only draft campaigns can be approved")
  }
  return errorJson(503, "SOCIAL_CAMPAIGN_STORE_UNAVAILABLE", "Social campaign storage is unavailable")
}

export async function GET(request: NextRequest) {
  if (!isInternalApiAuthorized(request)) return unauthorizedInternalApiResponse()

  const id = request.nextUrl.searchParams.get("id")?.trim()
  try {
    if (id) {
      const campaign = await getSocialCampaignRecord(id)
      if (!campaign) return errorJson(404, "SOCIAL_CAMPAIGN_NOT_FOUND", "Social campaign was not found")
      return noStoreJson({
        ok: true,
        campaign,
        publishers: getSocialPublisherConfiguration(),
      })
    }

    const campaigns = await listSocialCampaignRecords(20)
    return noStoreJson({
      ok: true,
      campaigns,
      publishers: getSocialPublisherConfiguration(),
    })
  } catch {
    return errorJson(503, "SOCIAL_CAMPAIGN_STORE_UNAVAILABLE", "Social campaign storage is unavailable")
  }
}

export async function POST(request: NextRequest) {
  if (!isInternalApiAuthorized(request)) return unauthorizedInternalApiResponse()

  const parsed = mutationSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return errorJson(400, "SOCIAL_PUBLISHER_REQUEST_INVALID", "Invalid social publisher request")
  }

  if (parsed.data.action === "approve") {
    try {
      const campaign = await approveSocialCampaignRecord(parsed.data.campaignId)
      return noStoreJson({ ok: true, campaign })
    } catch (error) {
      return campaignError(error)
    }
  }

  let campaign
  try {
    campaign = await getSocialCampaignRecord(parsed.data.campaignId)
  } catch {
    return errorJson(503, "SOCIAL_CAMPAIGN_STORE_UNAVAILABLE", "Social campaign storage is unavailable")
  }
  if (!campaign) return errorJson(404, "SOCIAL_CAMPAIGN_NOT_FOUND", "Social campaign was not found")
  if (!campaign.approvedAt || !["approved", "publishing", "partial", "failed"].includes(campaign.status)) {
    return errorJson(409, "SOCIAL_CAMPAIGN_APPROVAL_REQUIRED", "Campaign approval is required before publishing")
  }

  const availableChannels = new Set(campaign.output.posts.map((post) => post.channel))
  const requestedChannels = parsed.data.channels ?? campaign.output.posts.map((post) => post.channel)
  const uniqueChannels = [...new Set(requestedChannels)]
  if (uniqueChannels.some((channel) => !availableChannels.has(channel))) {
    return errorJson(400, "SOCIAL_CAMPAIGN_CHANNEL_NOT_FOUND", "Requested channel is not present in this campaign")
  }

  const results: SocialPublisherResult[] = []
  for (const channel of uniqueChannels) {
    const existing = campaign.deliveries.find((item) => item.channel === channel)
    if (existing?.status === "published") {
      results.push({
        channel,
        status: "published",
        externalId: existing.externalId,
        errorCode: null,
      })
      continue
    }

    let claimToken: string | null = null
    try {
      const claim = await claimSocialCampaignDelivery({ id: campaign.id, channel })
      campaign = claim.record
      claimToken = claim.token

      if (!claim.claimed) {
        const delivery = campaign.deliveries.find((item) => item.channel === channel)
        if (delivery?.status === "published") {
          results.push({
            channel,
            status: "published",
            externalId: delivery.externalId,
            errorCode: null,
          })
        } else {
          results.push({
            channel,
            status: "failed",
            externalId: null,
            errorCode: "SOCIAL_PUBLISH_ALREADY_IN_PROGRESS",
          })
        }
        continue
      }

      const result = await publishSocialChannel(campaign, channel)
      campaign = await updateSocialCampaignDelivery({
        id: campaign.id,
        channel,
        status: result.status,
        externalId: result.externalId,
        errorCode: result.errorCode,
      })
      results.push(result)
    } catch {
      try {
        campaign = await updateSocialCampaignDelivery({
          id: campaign.id,
          channel,
          status: "failed",
          errorCode: "SOCIAL_PUBLISH_STATE_FAILED",
        })
      } catch {
        // Preserve the closed response even when state reconciliation is unavailable.
      }
      results.push({
        channel,
        status: "failed",
        externalId: null,
        errorCode: "SOCIAL_PUBLISH_STATE_FAILED",
      })
    } finally {
      if (claimToken) {
        await releaseSocialCampaignDeliveryClaim({ id: campaign.id, token: claimToken }).catch(
          () => undefined,
        )
      }
    }
  }

  return noStoreJson({
    ok: results.some((result) => result.status === "published"),
    campaign,
    results,
  })
}
