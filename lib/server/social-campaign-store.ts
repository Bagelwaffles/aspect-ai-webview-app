import { createHash, randomUUID } from "node:crypto"

import { Redis } from "@upstash/redis"
import { z } from "zod"

import {
  SOCIAL_CAMPAIGN_AGENT_VERSION,
  socialCampaignInputSchema,
  socialCampaignOutputSchema,
  socialChannelSchema,
  type SocialCampaignInput,
  type SocialCampaignOutput,
  type SocialChannel,
} from "@/lib/server/social-campaign-agent"

const PREFIX = "ams:social-campaign:v1"
const RECENT_KEY = `${PREFIX}:recent`
const RETENTION_SECONDS = 60 * 60 * 24 * 90
const MAX_RECENT = 100

export const socialCampaignStatusSchema = z.enum([
  "draft",
  "approved",
  "publishing",
  "published",
  "partial",
  "failed",
])

export const socialChannelDeliveryStatusSchema = z.enum([
  "draft",
  "approved",
  "publishing",
  "published",
  "failed",
  "not_configured",
])

const socialChannelDeliverySchema = z
  .object({
    channel: socialChannelSchema,
    status: socialChannelDeliveryStatusSchema,
    externalId: z.string().max(500).nullable(),
    errorCode: z.string().max(120).nullable(),
    updatedAt: z.string().datetime(),
  })
  .strict()

export const socialCampaignRecordSchema = z
  .object({
    id: z.string().regex(/^social-campaign-[A-Za-z0-9-]{8,80}$/),
    idempotencyKey: z.string().trim().min(8).max(120),
    inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    agentVersion: z.literal(SOCIAL_CAMPAIGN_AGENT_VERSION),
    input: socialCampaignInputSchema,
    output: socialCampaignOutputSchema,
    status: socialCampaignStatusSchema,
    deliveries: z.array(socialChannelDeliverySchema).min(1).max(5),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    approvedAt: z.string().datetime().nullable(),
  })
  .strict()

export type SocialCampaignStatus = z.infer<typeof socialCampaignStatusSchema>
export type SocialChannelDeliveryStatus = z.infer<typeof socialChannelDeliveryStatusSchema>
export type SocialChannelDelivery = z.infer<typeof socialChannelDeliverySchema>
export type SocialCampaignRecord = z.infer<typeof socialCampaignRecordSchema>

export function isSocialCampaignStoreConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const url = (env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL)?.trim()
  const token = (env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN)?.trim()
  return Boolean(url && token)
}

function getRedis(): Redis {
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)?.trim()
  if (!url || !token) throw new Error("SOCIAL_CAMPAIGN_STORE_UNAVAILABLE")
  return new Redis({ url, token })
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function campaignKey(id: string) {
  return `${PREFIX}:campaign:${id}`
}

function idempotencyRedisKey(key: string) {
  return `${PREFIX}:idempotency:${digest(key)}`
}

function normalizeIdempotencyKey(value: string): string {
  const normalized = value.trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/.test(normalized)) {
    throw new Error("SOCIAL_CAMPAIGN_INVALID_IDEMPOTENCY_KEY")
  }
  return normalized
}

export function socialCampaignInputFingerprint(input: SocialCampaignInput) {
  return digest(JSON.stringify(socialCampaignInputSchema.parse(input)))
}

async function putRecord(redis: Redis, record: SocialCampaignRecord) {
  await redis.set(campaignKey(record.id), record, { ex: RETENTION_SECONDS })
}

async function remember(redis: Redis, id: string) {
  await redis.lpush(RECENT_KEY, id)
  await redis.ltrim(RECENT_KEY, 0, MAX_RECENT - 1)
}

export async function findSocialCampaignRecordByIdempotencyKey(
  value: string,
): Promise<SocialCampaignRecord | null> {
  const key = normalizeIdempotencyKey(value)
  const redis = getRedis()
  const id = await redis.get<string>(idempotencyRedisKey(key))
  if (!id) return null
  return getSocialCampaignRecord(id)
}

export async function createSocialCampaignRecord(input: {
  idempotencyKey: string
  campaign: SocialCampaignInput
  output: SocialCampaignOutput
}): Promise<{ created: boolean; record: SocialCampaignRecord }> {
  const redis = getRedis()
  const key = normalizeIdempotencyKey(input.idempotencyKey)
  const campaign = socialCampaignInputSchema.parse(input.campaign)
  const output = socialCampaignOutputSchema.parse(input.output)
  const inputFingerprint = socialCampaignInputFingerprint(campaign)
  const idemKey = idempotencyRedisKey(key)

  const newId = `social-campaign-${randomUUID()}`
  const reserved = await redis.set(idemKey, newId, { nx: true, ex: RETENTION_SECONDS })

  if (reserved !== "OK") {
    const existingId = await redis.get<string>(idemKey)
    if (!existingId) throw new Error("SOCIAL_CAMPAIGN_STORE_UNAVAILABLE")
    const existing = await getSocialCampaignRecord(existingId)
    if (!existing) throw new Error("SOCIAL_CAMPAIGN_STORE_UNAVAILABLE")
    if (existing.inputFingerprint !== inputFingerprint) {
      throw new Error("SOCIAL_CAMPAIGN_IDEMPOTENCY_CONFLICT")
    }
    return { created: false, record: existing }
  }

  const now = new Date().toISOString()
  const record = socialCampaignRecordSchema.parse({
    id: newId,
    idempotencyKey: key,
    inputFingerprint,
    agentVersion: SOCIAL_CAMPAIGN_AGENT_VERSION,
    input: campaign,
    output,
    status: "draft",
    deliveries: output.posts.map((post) => ({
      channel: post.channel,
      status: "draft",
      externalId: null,
      errorCode: null,
      updatedAt: now,
    })),
    createdAt: now,
    updatedAt: now,
    approvedAt: null,
  })

  try {
    await putRecord(redis, record)
    await remember(redis, record.id)
  } catch (error) {
    await redis.del(idemKey).catch(() => undefined)
    throw error
  }

  return { created: true, record }
}

export async function getSocialCampaignRecord(id: string): Promise<SocialCampaignRecord | null> {
  if (!/^social-campaign-[A-Za-z0-9-]{8,80}$/.test(id)) return null
  const raw = await getRedis().get<unknown>(campaignKey(id))
  if (!raw) return null
  return socialCampaignRecordSchema.parse(raw)
}

export async function listSocialCampaignRecords(limit = 20): Promise<SocialCampaignRecord[]> {
  const redis = getRedis()
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)))
  const ids = await redis.lrange<string>(RECENT_KEY, 0, safeLimit - 1)
  const records = await Promise.all(ids.map((id) => redis.get<unknown>(campaignKey(id))))
  return records
    .filter((record): record is unknown => Boolean(record))
    .map((record) => socialCampaignRecordSchema.parse(record))
}

export async function approveSocialCampaignRecord(id: string): Promise<SocialCampaignRecord> {
  const redis = getRedis()
  const record = await getSocialCampaignRecord(id)
  if (!record) throw new Error("SOCIAL_CAMPAIGN_NOT_FOUND")
  if (record.status !== "draft") {
    if (record.status === "approved") return record
    throw new Error("SOCIAL_CAMPAIGN_NOT_DRAFT")
  }

  const now = new Date().toISOString()
  const next = socialCampaignRecordSchema.parse({
    ...record,
    status: "approved",
    approvedAt: now,
    updatedAt: now,
    deliveries: record.deliveries.map((delivery) => ({
      ...delivery,
      status: "approved",
      updatedAt: now,
    })),
  })
  await putRecord(redis, next)
  return next
}

export async function updateSocialCampaignDelivery(input: {
  id: string
  channel: SocialChannel
  status: SocialChannelDeliveryStatus
  externalId?: string | null
  errorCode?: string | null
}): Promise<SocialCampaignRecord> {
  const redis = getRedis()
  const record = await getSocialCampaignRecord(input.id)
  if (!record) throw new Error("SOCIAL_CAMPAIGN_NOT_FOUND")

  const now = new Date().toISOString()
  let found = false
  const deliveries = record.deliveries.map((delivery) => {
    if (delivery.channel !== input.channel) return delivery
    found = true
    return socialChannelDeliverySchema.parse({
      ...delivery,
      status: input.status,
      externalId: input.externalId ?? null,
      errorCode: input.errorCode ?? null,
      updatedAt: now,
    })
  })
  if (!found) throw new Error("SOCIAL_CAMPAIGN_CHANNEL_NOT_FOUND")

  const statuses = deliveries.map((delivery) => delivery.status)
  let status: SocialCampaignStatus = record.status
  if (statuses.every((value) => value === "published")) status = "published"
  else if (statuses.some((value) => value === "published")) status = "partial"
  else if (statuses.some((value) => value === "publishing")) status = "publishing"
  else if (statuses.every((value) => value === "failed" || value === "not_configured")) status = "failed"
  else if (record.approvedAt) status = "approved"

  const next = socialCampaignRecordSchema.parse({
    ...record,
    status,
    deliveries,
    updatedAt: now,
  })
  await putRecord(redis, next)
  return next
}
