import { z } from "zod"

export const socialPlatformSchema = z.enum(["facebook", "instagram", "linkedin", "tiktok"])
export type SocialPlatform = z.infer<typeof socialPlatformSchema>

export const socialPostSchema = z
  .object({
    campaign: z.string().trim().min(2).max(120),
    platform: socialPlatformSchema,
    body: z.string().trim().min(1).max(6_000),
    headline: z.string().trim().max(240).optional(),
    callToAction: z.string().trim().max(500).optional(),
    destinationUrl: z.string().url().optional(),
    scheduledFor: z.string().datetime().optional(),
  })
  .strict()

export type SocialPostInput = z.infer<typeof socialPostSchema>

export type SocialPublishStatus =
  | "draft"
  | "approved"
  | "blocked_missing_credentials"
  | "ready"
  | "published"
  | "failed"

export type SocialPublishRecord = SocialPostInput & {
  id: string
  createdAt: string
  approvedAt?: string
  publishedAt?: string
  status: SocialPublishStatus
  platformPostId?: string
  errorCode?: string
}

export type PlatformCredentialState = Record<SocialPlatform, boolean>

export function getPlatformCredentialState(env: NodeJS.ProcessEnv = process.env): PlatformCredentialState {
  return {
    facebook: Boolean(env.META_PAGE_ACCESS_TOKEN?.trim() && env.META_PAGE_ID?.trim()),
    instagram: Boolean(env.META_PAGE_ACCESS_TOKEN?.trim() && env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim()),
    linkedin: Boolean(env.LINKEDIN_ACCESS_TOKEN?.trim() && env.LINKEDIN_AUTHOR_URN?.trim()),
    tiktok: Boolean(env.TIKTOK_ACCESS_TOKEN?.trim() && env.TIKTOK_OPEN_ID?.trim()),
  }
}

export function prepareSocialPost(input: SocialPostInput): SocialPublishRecord {
  const parsed = socialPostSchema.parse(input)
  return {
    ...parsed,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: "draft",
  }
}

export function approveSocialPost(
  record: SocialPublishRecord,
  credentials: PlatformCredentialState = getPlatformCredentialState(),
): SocialPublishRecord {
  const approvedAt = new Date().toISOString()
  return {
    ...record,
    approvedAt,
    status: credentials[record.platform] ? "ready" : "blocked_missing_credentials",
  }
}

export function buildPublishPreview(record: SocialPublishRecord) {
  return {
    id: record.id,
    campaign: record.campaign,
    platform: record.platform,
    headline: record.headline ?? null,
    body: record.body,
    callToAction: record.callToAction ?? null,
    destinationUrl: record.destinationUrl ?? null,
    scheduledFor: record.scheduledFor ?? null,
    status: record.status,
  }
}

export function assertPublishable(record: SocialPublishRecord): void {
  if (record.status !== "ready") {
    throw new Error("SOCIAL_POST_NOT_READY")
  }
}

export async function publishSocialPost(_record: SocialPublishRecord): Promise<never> {
  throw new Error("SOCIAL_PLATFORM_DELIVERY_NOT_CONFIGURED")
}
