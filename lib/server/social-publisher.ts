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

type ProviderFetch = typeof fetch

type PublisherDependencies = {
  fetch?: ProviderFetch
  timeoutMs?: number
  env?: NodeJS.ProcessEnv
}

function normalized(value: string | undefined) {
  return value?.trim() ?? ""
}

function hasBearerToken(value: string) {
  return value.length >= 20 && !/^(?:replace|placeholder|changeme|your[-_ ])/iu.test(value)
}

function isHttpsPublicUrl(value: string | undefined) {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !/^(?:localhost|127\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)/u.test(url.hostname)
  } catch {
    return false
  }
}

function linkedinConfig(env: NodeJS.ProcessEnv = process.env) {
  const token = normalized(env.AMS_LINKEDIN_ACCESS_TOKEN)
  const author = normalized(env.AMS_LINKEDIN_AUTHOR_URN)
  const version = normalized(env.AMS_LINKEDIN_API_VERSION)
  return {
    token,
    author,
    version,
    configured:
      hasBearerToken(token) &&
      /^urn:li:(?:person|organization):[A-Za-z0-9_-]+$/.test(author) &&
      /^20\d{4}$/.test(version),
  }
}

function metaConfig(env: NodeJS.ProcessEnv = process.env) {
  const token = normalized(env.AMS_META_ACCESS_TOKEN)
  const graphVersion = normalized(env.AMS_META_GRAPH_API_VERSION)
  const facebookPageId = normalized(env.AMS_FACEBOOK_PAGE_ID)
  const instagramUserId = normalized(env.AMS_INSTAGRAM_USER_ID)
  return {
    token,
    graphVersion,
    facebookPageId,
    instagramUserId,
    facebookConfigured: hasBearerToken(token) && /^[A-Za-z0-9_.-]{3,120}$/.test(facebookPageId) && /^v\d+\.\d+$/.test(graphVersion),
    instagramConfigured: hasBearerToken(token) && /^[A-Za-z0-9_.-]{3,120}$/.test(instagramUserId) && /^v\d+\.\d+$/.test(graphVersion),
  }
}

function pinterestConfig(env: NodeJS.ProcessEnv = process.env) {
  const token = normalized(env.AMS_PINTEREST_ACCESS_TOKEN)
  const boardId = normalized(env.AMS_PINTEREST_BOARD_ID)
  return {
    token,
    boardId,
    configured: hasBearerToken(token) && /^[A-Za-z0-9_-]{6,120}$/.test(boardId),
  }
}

function youtubeConfig(env: NodeJS.ProcessEnv = process.env) {
  const clientId = normalized(env.AMS_YOUTUBE_CLIENT_ID)
  const clientSecret = normalized(env.AMS_YOUTUBE_CLIENT_SECRET)
  const refreshToken = normalized(env.AMS_YOUTUBE_REFRESH_TOKEN)
  const channelId = normalized(env.AMS_YOUTUBE_CHANNEL_ID)
  return {
    clientId,
    clientSecret,
    refreshToken,
    channelId,
    configured:
      clientId.length >= 20 &&
      clientSecret.length >= 20 &&
      refreshToken.length >= 20 &&
      /^UC[A-Za-z0-9_-]{20,}$/u.test(channelId),
  }
}

export function getSocialPublisherConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const meta = metaConfig(env)
  return {
    linkedin: linkedinConfig(env).configured,
    facebook: meta.facebookConfigured,
    instagram: meta.instagramConfigured,
    pinterest: pinterestConfig(env).configured,
    "youtube-shorts": youtubeConfig(env).configured,
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

async function fetchWithTimeout(
  fetcher: ProviderFetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetcher(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

function timeoutCode(error: unknown, fallback: string, timeout: string) {
  return error instanceof Error && error.name === "AbortError" ? timeout : fallback
}

async function safeJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed = await response.json()
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

async function publishLinkedIn(
  record: SocialCampaignRecord,
  draft: SocialDraft,
  dependencies: Required<PublisherDependencies>,
): Promise<SocialPublisherResult> {
  const config = linkedinConfig(dependencies.env)
  if (!config.configured) {
    return {
      channel: "linkedin",
      status: "not_configured",
      externalId: null,
      errorCode: "LINKEDIN_PUBLISHER_NOT_CONFIGURED",
    }
  }

  try {
    const response = await fetchWithTimeout(dependencies.fetch, "https://api.linkedin.com/rest/posts", {
      method: "POST",
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
    }, dependencies.timeoutMs)

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
  }
}

async function publishFacebook(
  record: SocialCampaignRecord,
  draft: SocialDraft,
  dependencies: Required<PublisherDependencies>,
): Promise<SocialPublisherResult> {
  const config = metaConfig(dependencies.env)
  if (!config.facebookConfigured) {
    return { channel: "facebook", status: "not_configured", externalId: null, errorCode: "FACEBOOK_PUBLISHER_NOT_CONFIGURED" }
  }

  const body = new URLSearchParams({
    message: renderDraftText(record, draft),
    access_token: config.token,
  })
  if (isHttpsPublicUrl(record.input.destinationUrl)) body.set("link", record.input.destinationUrl!)

  try {
    const response = await fetchWithTimeout(
      dependencies.fetch,
      `https://graph.facebook.com/${config.graphVersion}/${encodeURIComponent(config.facebookPageId)}/feed`,
      { method: "POST", body },
      dependencies.timeoutMs,
    )
    if (!response.ok) {
      return { channel: "facebook", status: "failed", externalId: null, errorCode: `FACEBOOK_HTTP_${response.status}` }
    }
    const json = await safeJson(response)
    return { channel: "facebook", status: "published", externalId: stringField(json.id), errorCode: null }
  } catch (error) {
    return {
      channel: "facebook",
      status: "failed",
      externalId: null,
      errorCode: timeoutCode(error, "FACEBOOK_PUBLISH_FAILED", "FACEBOOK_PUBLISH_TIMEOUT"),
    }
  }
}

async function publishInstagram(
  record: SocialCampaignRecord,
  draft: SocialDraft,
  dependencies: Required<PublisherDependencies>,
): Promise<SocialPublisherResult> {
  const config = metaConfig(dependencies.env)
  if (!config.instagramConfigured) {
    return { channel: "instagram" as SocialChannel, status: "not_configured", externalId: null, errorCode: "INSTAGRAM_PUBLISHER_NOT_CONFIGURED" }
  }
  if (!isHttpsPublicUrl(record.input.destinationUrl)) {
    return { channel: "instagram" as SocialChannel, status: "failed", externalId: null, errorCode: "INSTAGRAM_MEDIA_URL_REQUIRED" }
  }

  try {
    const caption = renderDraftText(record, draft)
    const createBody = new URLSearchParams({
      image_url: record.input.destinationUrl!,
      caption,
      access_token: config.token,
    })
    const createResponse = await fetchWithTimeout(
      dependencies.fetch,
      `https://graph.facebook.com/${config.graphVersion}/${encodeURIComponent(config.instagramUserId)}/media`,
      { method: "POST", body: createBody },
      dependencies.timeoutMs,
    )
    if (!createResponse.ok) {
      return { channel: "instagram" as SocialChannel, status: "failed", externalId: null, errorCode: `INSTAGRAM_CREATE_HTTP_${createResponse.status}` }
    }
    const createJson = await safeJson(createResponse)
    const creationId = stringField(createJson.id)
    if (!creationId) {
      return { channel: "instagram" as SocialChannel, status: "failed", externalId: null, errorCode: "INSTAGRAM_CREATE_ID_MISSING" }
    }

    const publishBody = new URLSearchParams({
      creation_id: creationId,
      access_token: config.token,
    })
    const publishResponse = await fetchWithTimeout(
      dependencies.fetch,
      `https://graph.facebook.com/${config.graphVersion}/${encodeURIComponent(config.instagramUserId)}/media_publish`,
      { method: "POST", body: publishBody },
      dependencies.timeoutMs,
    )
    if (!publishResponse.ok) {
      return { channel: "instagram" as SocialChannel, status: "failed", externalId: null, errorCode: `INSTAGRAM_PUBLISH_HTTP_${publishResponse.status}` }
    }
    const publishJson = await safeJson(publishResponse)
    return { channel: "instagram" as SocialChannel, status: "published", externalId: stringField(publishJson.id), errorCode: null }
  } catch (error) {
    return {
      channel: "instagram" as SocialChannel,
      status: "failed",
      externalId: null,
      errorCode: timeoutCode(error, "INSTAGRAM_PUBLISH_FAILED", "INSTAGRAM_PUBLISH_TIMEOUT"),
    }
  }
}

async function publishPinterest(
  record: SocialCampaignRecord,
  draft: SocialDraft,
  dependencies: Required<PublisherDependencies>,
): Promise<SocialPublisherResult> {
  const config = pinterestConfig(dependencies.env)
  if (!config.configured) {
    return { channel: "pinterest", status: "not_configured", externalId: null, errorCode: "PINTEREST_PUBLISHER_NOT_CONFIGURED" }
  }
  if (!isHttpsPublicUrl(record.input.destinationUrl)) {
    return { channel: "pinterest", status: "failed", externalId: null, errorCode: "PINTEREST_MEDIA_URL_REQUIRED" }
  }

  try {
    const response = await fetchWithTimeout(
      dependencies.fetch,
      "https://api.pinterest.com/v5/pins",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          board_id: config.boardId,
          title: draft.title ?? record.input.campaignName,
          description: renderDraftText(record, draft),
          link: isHttpsPublicUrl(record.input.destinationUrl) ? record.input.destinationUrl : undefined,
          media_source: {
            source_type: "image_url",
            url: record.input.destinationUrl,
          },
        }),
      },
      dependencies.timeoutMs,
    )
    if (!response.ok) {
      return { channel: "pinterest", status: "failed", externalId: null, errorCode: `PINTEREST_HTTP_${response.status}` }
    }
    const json = await safeJson(response)
    return { channel: "pinterest", status: "published", externalId: stringField(json.id), errorCode: null }
  } catch (error) {
    return {
      channel: "pinterest",
      status: "failed",
      externalId: null,
      errorCode: timeoutCode(error, "PINTEREST_PUBLISH_FAILED", "PINTEREST_PUBLISH_TIMEOUT"),
    }
  }
}

async function publishYouTubeShorts(
  record: SocialCampaignRecord,
  _draft: SocialDraft,
  _dependencies: Required<PublisherDependencies>,
): Promise<SocialPublisherResult> {
  void _draft
  const config = youtubeConfig(_dependencies.env)
  if (!config.configured) {
    return { channel: "youtube-shorts", status: "not_configured", externalId: null, errorCode: "YOUTUBE_SHORTS_PUBLISHER_NOT_CONFIGURED" }
  }
  if (!isHttpsPublicUrl(record.input.destinationUrl) || !/\.(?:mp4|mov|webm)(?:\?|$)/iu.test(record.input.destinationUrl!)) {
    return { channel: "youtube-shorts", status: "failed", externalId: null, errorCode: "YOUTUBE_SHORTS_VIDEO_URL_REQUIRED" }
  }

  return {
    channel: "youtube-shorts",
    status: "not_configured",
    externalId: null,
    errorCode: "YOUTUBE_SHORTS_UPLOAD_NOT_VERIFIED",
  }
}

export async function publishSocialChannel(
  record: SocialCampaignRecord,
  channel: SocialChannel,
  dependencies: PublisherDependencies = {},
): Promise<SocialPublisherResult> {
  const deps: Required<PublisherDependencies> = {
    fetch: dependencies.fetch ?? fetch,
    timeoutMs: dependencies.timeoutMs ?? 15_000,
    env: dependencies.env ?? process.env,
  }

  if (
    !record.approvedAt ||
    !["approved", "publishing", "partial", "failed"].includes(record.status)
  ) {
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

  if (channel === "linkedin") return publishLinkedIn(record, draft, deps)
  if (channel === "facebook") return publishFacebook(record, draft, deps)
  if (channel === "instagram") return publishInstagram(record, draft, deps)
  if (channel === "pinterest") return publishPinterest(record, draft, deps)
  if (channel === "youtube-shorts") return publishYouTubeShorts(record, draft, deps)

  return { channel, status: "not_configured", externalId: null, errorCode: "SOCIAL_CHANNEL_NOT_CONFIGURED" }
}
