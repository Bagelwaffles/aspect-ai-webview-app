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

function isPlaceholder(value: string) {
  return /(?:^|[:_-])(?:replace|placeholder|changeme|your)(?:$|[:_-])/iu.test(value)
}

function hasBearerToken(value: string) {
  return value.length >= 20 && !isPlaceholder(value)
}

function hasConfiguredIdentifier(value: string, pattern: RegExp) {
  return pattern.test(value) && !isPlaceholder(value)
}

function isHttpsPublicUrl(value: string | undefined) {
  if (!value) return false
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    if (url.protocol !== "https:") return false
    if (hostname === "localhost" || hostname === "::1" || hostname.endsWith(".local")) return false
    if (/^(?:127\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)/u.test(hostname)) return false
    return true
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
      hasConfiguredIdentifier(author, /^urn:li:(?:person|organization):[A-Za-z0-9_-]+$/u) &&
      /^20\d{4}$/u.test(version),
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
    facebookConfigured:
      hasBearerToken(token) &&
      hasConfiguredIdentifier(facebookPageId, /^[A-Za-z0-9_.-]{3,120}$/u) &&
      /^v\d+\.\d+$/u.test(graphVersion),
    instagramConfigured:
      hasBearerToken(token) &&
      hasConfiguredIdentifier(instagramUserId, /^[A-Za-z0-9_.-]{3,120}$/u) &&
      /^v\d+\.\d+$/u.test(graphVersion),
  }
}

function pinterestConfig(env: NodeJS.ProcessEnv = process.env) {
  const token = normalized(env.AMS_PINTEREST_ACCESS_TOKEN)
  const boardId = normalized(env.AMS_PINTEREST_BOARD_ID)
  return {
    token,
    boardId,
    configured:
      hasBearerToken(token) &&
      hasConfiguredIdentifier(boardId, /^[A-Za-z0-9_-]{6,120}$/u),
  }
}

export function getSocialPublisherConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const meta = metaConfig(env)
  return {
    linkedin: linkedinConfig(env).configured,
    facebook: meta.facebookConfigured,
    instagram: meta.instagramConfigured,
    pinterest: pinterestConfig(env).configured,
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

function timeoutError() {
  const error = new Error("Provider request timed out")
  error.name = "AbortError"
  return error
}

async function withProviderTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController()
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort()
      reject(timeoutError())
    }, timeoutMs)

    operation(controller.signal).then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

async function fetchWithTimeout(
  fetcher: ProviderFetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  return withProviderTimeout(
    (signal) =>
      fetcher(url, {
        ...init,
        cache: "no-store",
        signal,
      }),
    timeoutMs,
  )
}

async function safeJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed = await response.json()
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

async function fetchJsonWithTimeout(
  fetcher: ProviderFetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ response: Response; json: Record<string, unknown> }> {
  return withProviderTimeout(async (signal) => {
    const response = await fetcher(url, {
      ...init,
      cache: "no-store",
      signal,
    })
    const json = await safeJson(response)
    return { response, json }
  }, timeoutMs)
}

function timeoutCode(error: unknown, fallback: string, timeout: string) {
  return error instanceof Error && error.name === "AbortError" ? timeout : fallback
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
    const response = await fetchWithTimeout(
      dependencies.fetch,
      "https://api.linkedin.com/rest/posts",
      {
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
      },
      dependencies.timeoutMs,
    )

    if (!response.ok) {
      return {
        channel: "linkedin",
        status: "failed",
        externalId: null,
        errorCode: `LINKEDIN_HTTP_${response.status}`,
      }
    }

    const externalId = response.headers.get("x-restli-id")?.trim() || null
    if (!externalId) {
      return {
        channel: "linkedin",
        status: "failed",
        externalId: null,
        errorCode: "LINKEDIN_POST_ID_MISSING",
      }
    }

    return {
      channel: "linkedin",
      status: "published",
      externalId,
      errorCode: null,
    }
  } catch (error) {
    return {
      channel: "linkedin",
      status: "failed",
      externalId: null,
      errorCode: timeoutCode(error, "LINKEDIN_PUBLISH_FAILED", "LINKEDIN_PUBLISH_TIMEOUT"),
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
    return {
      channel: "facebook",
      status: "not_configured",
      externalId: null,
      errorCode: "FACEBOOK_PUBLISHER_NOT_CONFIGURED",
    }
  }

  const body = new URLSearchParams({
    message: renderDraftText(record, draft),
    access_token: config.token,
  })
  if (isHttpsPublicUrl(record.input.destinationUrl)) body.set("link", record.input.destinationUrl!)

  try {
    const { response, json } = await fetchJsonWithTimeout(
      dependencies.fetch,
      `https://graph.facebook.com/${config.graphVersion}/${encodeURIComponent(config.facebookPageId)}/feed`,
      { method: "POST", body },
      dependencies.timeoutMs,
    )
    if (!response.ok) {
      return {
        channel: "facebook",
        status: "failed",
        externalId: null,
        errorCode: `FACEBOOK_HTTP_${response.status}`,
      }
    }
    const externalId = stringField(json.id)
    if (!externalId) {
      return {
        channel: "facebook",
        status: "failed",
        externalId: null,
        errorCode: "FACEBOOK_POST_ID_MISSING",
      }
    }
    return { channel: "facebook", status: "published", externalId, errorCode: null }
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
    return {
      channel: "instagram",
      status: "not_configured",
      externalId: null,
      errorCode: "INSTAGRAM_PUBLISHER_NOT_CONFIGURED",
    }
  }
  if (!isHttpsPublicUrl(record.input.mediaUrl)) {
    return {
      channel: "instagram",
      status: "failed",
      externalId: null,
      errorCode: "INSTAGRAM_MEDIA_URL_REQUIRED",
    }
  }

  try {
    const createBody = new URLSearchParams({
      image_url: record.input.mediaUrl!,
      caption: renderDraftText(record, draft),
      access_token: config.token,
    })
    const created = await fetchJsonWithTimeout(
      dependencies.fetch,
      `https://graph.facebook.com/${config.graphVersion}/${encodeURIComponent(config.instagramUserId)}/media`,
      { method: "POST", body: createBody },
      dependencies.timeoutMs,
    )
    if (!created.response.ok) {
      return {
        channel: "instagram",
        status: "failed",
        externalId: null,
        errorCode: `INSTAGRAM_CREATE_HTTP_${created.response.status}`,
      }
    }
    const creationId = stringField(created.json.id)
    if (!creationId) {
      return {
        channel: "instagram",
        status: "failed",
        externalId: null,
        errorCode: "INSTAGRAM_CREATE_ID_MISSING",
      }
    }

    const publishBody = new URLSearchParams({
      creation_id: creationId,
      access_token: config.token,
    })
    const published = await fetchJsonWithTimeout(
      dependencies.fetch,
      `https://graph.facebook.com/${config.graphVersion}/${encodeURIComponent(config.instagramUserId)}/media_publish`,
      { method: "POST", body: publishBody },
      dependencies.timeoutMs,
    )
    if (!published.response.ok) {
      return {
        channel: "instagram",
        status: "failed",
        externalId: null,
        errorCode: `INSTAGRAM_PUBLISH_HTTP_${published.response.status}`,
      }
    }
    const externalId = stringField(published.json.id)
    if (!externalId) {
      return {
        channel: "instagram",
        status: "failed",
        externalId: null,
        errorCode: "INSTAGRAM_POST_ID_MISSING",
      }
    }
    return { channel: "instagram", status: "published", externalId, errorCode: null }
  } catch (error) {
    return {
      channel: "instagram",
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
    return {
      channel: "pinterest",
      status: "not_configured",
      externalId: null,
      errorCode: "PINTEREST_PUBLISHER_NOT_CONFIGURED",
    }
  }
  if (!isHttpsPublicUrl(record.input.mediaUrl)) {
    return {
      channel: "pinterest",
      status: "failed",
      externalId: null,
      errorCode: "PINTEREST_MEDIA_URL_REQUIRED",
    }
  }

  try {
    const title = (draft.title ?? record.input.campaignName).slice(0, 100)
    const description = renderDraftText(record, draft).slice(0, 800)
    const { response, json } = await fetchJsonWithTimeout(
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
          title,
          description,
          link: isHttpsPublicUrl(record.input.destinationUrl) ? record.input.destinationUrl : undefined,
          media_source: {
            source_type: "image_url",
            url: record.input.mediaUrl,
          },
        }),
      },
      dependencies.timeoutMs,
    )
    if (!response.ok) {
      return {
        channel: "pinterest",
        status: "failed",
        externalId: null,
        errorCode: `PINTEREST_HTTP_${response.status}`,
      }
    }
    const externalId = stringField(json.id)
    if (!externalId) {
      return {
        channel: "pinterest",
        status: "failed",
        externalId: null,
        errorCode: "PINTEREST_PIN_ID_MISSING",
      }
    }
    return { channel: "pinterest", status: "published", externalId, errorCode: null }
  } catch (error) {
    return {
      channel: "pinterest",
      status: "failed",
      externalId: null,
      errorCode: timeoutCode(error, "PINTEREST_PUBLISH_FAILED", "PINTEREST_PUBLISH_TIMEOUT"),
    }
  }
}

function publishYouTubeShorts(): SocialPublisherResult {
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
  return publishYouTubeShorts()
}
