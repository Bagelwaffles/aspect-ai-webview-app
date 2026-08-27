import type {
  SocialCampaignRecord,
  SocialChannelDeliveryStatus,
} from "@/lib/server/social-campaign-store"
import type { SocialChannel, SocialDraft } from "@/lib/server/social-campaign-agent"

export type SocialPublisherResult = {
  channel: SocialChannel
  status: Extract<SocialChannelDeliveryStatus, "published" | "failed" | "not_configured">
  externalId: string | null
  errorCode: string | null
}

function normalized(value: string | undefined) {
  return value?.trim() ?? ""
}

function linkedinConfig() {
  const token = normalized(process.env.AMS_LINKEDIN_ACCESS_TOKEN)
  const author = normalized(process.env.AMS_LINKEDIN_AUTHOR_URN)
  const version = normalized(process.env.AMS_LINKEDIN_API_VERSION)
  return {
    token,
    author,
    version,
    configured:
      token.length >= 20 &&
      /^urn:li:(?:person|organization):[A-Za-z0-9_-]+$/.test(author) &&
      /^20\d{4}$/.test(version),
  }
}

export function getSocialPublisherConfiguration() {
  return {
    linkedin: linkedinConfig().configured,
    facebook: false,
    pinterest: false,
    "youtube-shorts": false,
  } satisfies Record<SocialChannel, boolean>
}

function renderDraftText(record: SocialCampaignRecord, draft: SocialDraft) {
  const parts = [draft.body.trim(), draft.callToAction.trim()]
  if (record.input.destinationUrl) parts.push(record.input.destinationUrl)
  if (draft.hashtags.length > 0) {
    parts.push(
      draft.hashtags
        .map((tag) => tag.trim())
        .filter(Boolean)
        .map((tag) => (tag.startsWith("#") ? tag : `#${tag.replace(/\s+/g, "")}`))
        .join(" "),
    )
  }
  return parts.filter(Boolean).join("\n\n").slice(0, 3_000)
}

async function publishLinkedIn(record: SocialCampaignRecord, draft: SocialDraft): Promise<SocialPublisherResult> {
  const config = linkedinConfig()
  if (!config.configured) {
    return {
      channel: "linkedin",
      status: "not_configured",
      externalId: null,
      errorCode: "LINKEDIN_PUBLISHER_NOT_CONFIGURED",
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        "Linkedin-Version": config.version,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author: config.author,
        commentary: renderDraftText(record, draft),
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    })

    if (!response.ok) {
      return {
        channel: "linkedin",
        status: "failed",
        externalId: null,
        errorCode: `LINKEDIN_HTTP_${response.status}`,
      }
    }

    return {
      channel: "linkedin",
      status: "published",
      externalId: response.headers.get("x-restli-id")?.trim() || null,
      errorCode: null,
    }
  } catch (error) {
    return {
      channel: "linkedin",
      status: "failed",
      externalId: null,
      errorCode:
        error instanceof Error && error.name === "AbortError"
          ? "LINKEDIN_PUBLISH_TIMEOUT"
          : "LINKEDIN_PUBLISH_FAILED",
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function publishSocialChannel(
  record: SocialCampaignRecord,
  channel: SocialChannel,
): Promise<SocialPublisherResult> {
  if (!record.approvedAt || !["approved", "publishing", "partial"].includes(record.status)) {
    return {
      channel,
      status: "failed",
      externalId: null,
      errorCode: "SOCIAL_CAMPAIGN_APPROVAL_REQUIRED",
    }
  }

  const draft = record.output.posts.find((post) => post.channel === channel)
  if (!draft) {
    return {
      channel,
      status: "failed",
      externalId: null,
      errorCode: "SOCIAL_DRAFT_NOT_FOUND",
    }
  }

  if (channel === "linkedin") return publishLinkedIn(record, draft)

  const errorCode =
    channel === "facebook"
      ? "FACEBOOK_PUBLISHER_NOT_CONFIGURED"
      : channel === "pinterest"
        ? "PINTEREST_PUBLISHER_REQUIRES_MEDIA_AND_OAUTH"
        : "YOUTUBE_SHORTS_PUBLISHER_REQUIRES_VIDEO_AND_OAUTH"

  return {
    channel,
    status: "not_configured",
    externalId: null,
    errorCode,
  }
}
