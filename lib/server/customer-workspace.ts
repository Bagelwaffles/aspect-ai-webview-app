import { createHash, randomUUID } from "node:crypto"

import { Redis } from "@upstash/redis"
import { z } from "zod"

import { isStableCustomerSubject } from "@/lib/auth"

const WORKSPACE_PREFIX = "ams:customer-workspace:v1"
const MAX_ASSETS = 100

export const customerWorkspaceProfileSchema = z
  .object({
    businessName: z.string().trim().max(120).default(""),
    websiteUrl: z.string().trim().url().max(500).or(z.literal("")).default(""),
    audience: z.string().trim().max(500).default(""),
    brandVoice: z.string().trim().max(500).default(""),
    productsServices: z.string().trim().max(1_500).default(""),
    notes: z.string().trim().max(2_000).default(""),
  })
  .strict()

export type CustomerWorkspaceProfile = z.infer<typeof customerWorkspaceProfileSchema>

export const customerAssetSchema = z
  .object({
    id: z.string().uuid(),
    fileName: z.string().min(1).max(180),
    contentType: z.string().min(1).max(120),
    sizeBytes: z.number().int().positive().max(250 * 1024 * 1024),
    objectKey: z.string().min(1).max(700),
    status: z.enum(["pending", "ready"]),
    createdAt: z.string().datetime(),
    readyAt: z.string().datetime().nullable(),
  })
  .strict()

export type CustomerAsset = z.infer<typeof customerAssetSchema>

type RedisLike = {
  get<T = unknown>(key: string): Promise<T | null>
  set(key: string, value: string): Promise<unknown>
}

type WorkspaceOptions = {
  redis?: RedisLike | null
  now?: () => Date
  id?: () => string
}

function trimmed(value: string | undefined) {
  const result = value?.trim()
  return result || null
}

export function resolveWorkspaceRedisConfig(env: NodeJS.ProcessEnv = process.env) {
  const upstashUrl = trimmed(env.UPSTASH_REDIS_REST_URL)
  const upstashToken = trimmed(env.UPSTASH_REDIS_REST_TOKEN)
  if (upstashUrl && upstashToken) return { url: upstashUrl, token: upstashToken }

  const kvUrl = trimmed(env.KV_REST_API_URL)
  const kvToken = trimmed(env.KV_REST_API_TOKEN)
  if (kvUrl && kvToken) return { url: kvUrl, token: kvToken }

  return null
}

function redisClient(env: NodeJS.ProcessEnv = process.env): RedisLike | null {
  const config = resolveWorkspaceRedisConfig(env)
  return config ? new Redis(config) : null
}

function runtimeRedis(options: WorkspaceOptions) {
  return Object.prototype.hasOwnProperty.call(options, "redis") ? options.redis ?? null : redisClient()
}

export function customerWorkspaceSubjectHash(subject: string) {
  if (!isStableCustomerSubject(subject)) throw new Error("WORKSPACE_INVALID_SUBJECT")
  return createHash("sha256").update(subject).digest("hex")
}

function profileKey(subject: string) {
  return `${WORKSPACE_PREFIX}:${customerWorkspaceSubjectHash(subject)}:profile`
}

function assetsKey(subject: string) {
  return `${WORKSPACE_PREFIX}:${customerWorkspaceSubjectHash(subject)}:assets`
}

function parseStored<T>(raw: unknown, schema: z.ZodType<T>, fallback: T): T {
  if (raw === null || raw === undefined) return fallback

  let candidate = raw
  if (typeof raw === "string") {
    try {
      candidate = JSON.parse(raw)
    } catch {
      return fallback
    }
  }

  const parsed = schema.safeParse(candidate)
  return parsed.success ? parsed.data : fallback
}

const assetListSchema = z.array(customerAssetSchema).max(MAX_ASSETS)

export async function getCustomerWorkspaceProfile(
  subject: string,
  options: WorkspaceOptions = {},
): Promise<CustomerWorkspaceProfile> {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("WORKSPACE_STORE_UNAVAILABLE")

  const raw = await redis.get<unknown>(profileKey(subject))
  return parseStored(raw, customerWorkspaceProfileSchema, customerWorkspaceProfileSchema.parse({}))
}

export async function saveCustomerWorkspaceProfile(
  subject: string,
  input: unknown,
  options: WorkspaceOptions = {},
): Promise<CustomerWorkspaceProfile> {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("WORKSPACE_STORE_UNAVAILABLE")

  const profile = customerWorkspaceProfileSchema.parse(input)
  await redis.set(profileKey(subject), JSON.stringify(profile))
  return profile
}

export async function listCustomerAssets(
  subject: string,
  options: WorkspaceOptions = {},
): Promise<CustomerAsset[]> {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("WORKSPACE_STORE_UNAVAILABLE")

  const raw = await redis.get<unknown>(assetsKey(subject))
  return parseStored(raw, assetListSchema, []).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function safeFileName(fileName: string) {
  const base = fileName.trim().replace(/[^A-Za-z0-9._ -]/g, "_").replace(/\s+/g, " ")
  return (base || "asset").slice(0, 180)
}

function objectSafeName(fileName: string) {
  return safeFileName(fileName).replace(/\s+/g, "-").replace(/-+/g, "-")
}

async function writeAssets(subject: string, assets: CustomerAsset[], redis: RedisLike) {
  await redis.set(assetsKey(subject), JSON.stringify(assetListSchema.parse(assets.slice(0, MAX_ASSETS))))
}

export async function createPendingCustomerAsset(
  subject: string,
  input: { fileName: string; contentType: string; sizeBytes: number },
  options: WorkspaceOptions = {},
): Promise<CustomerAsset> {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("WORKSPACE_STORE_UNAVAILABLE")

  const id = (options.id ?? randomUUID)()
  const now = (options.now ?? (() => new Date()))().toISOString()
  const fileName = safeFileName(input.fileName)
  const subjectHash = customerWorkspaceSubjectHash(subject)

  const asset = customerAssetSchema.parse({
    id,
    fileName,
    contentType: input.contentType.trim().toLowerCase(),
    sizeBytes: input.sizeBytes,
    objectKey: `customers/${subjectHash}/${id}-${objectSafeName(fileName)}`,
    status: "pending",
    createdAt: now,
    readyAt: null,
  })

  const current = await listCustomerAssets(subject, { ...options, redis })
  await writeAssets(subject, [asset, ...current.filter((item) => item.id !== asset.id)], redis)
  return asset
}

export async function findCustomerAsset(
  subject: string,
  assetId: string,
  options: WorkspaceOptions = {},
): Promise<CustomerAsset | null> {
  if (!z.string().uuid().safeParse(assetId).success) return null
  const assets = await listCustomerAssets(subject, options)
  return assets.find((asset) => asset.id === assetId) ?? null
}

export async function markCustomerAssetReady(
  subject: string,
  assetId: string,
  options: WorkspaceOptions = {},
): Promise<CustomerAsset> {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("WORKSPACE_STORE_UNAVAILABLE")

  const assets = await listCustomerAssets(subject, { ...options, redis })
  const existing = assets.find((asset) => asset.id === assetId)
  if (!existing) throw new Error("ASSET_NOT_FOUND")

  const ready = customerAssetSchema.parse({
    ...existing,
    status: "ready",
    readyAt: existing.readyAt ?? (options.now ?? (() => new Date()))().toISOString(),
  })

  await writeAssets(
    subject,
    assets.map((asset) => (asset.id === assetId ? ready : asset)),
    redis,
  )
  return ready
}

export function customerWorkspaceContext(profile: CustomerWorkspaceProfile) {
  const context = {
    businessName: profile.businessName || undefined,
    websiteUrl: profile.websiteUrl || undefined,
    audience: profile.audience || undefined,
    brandVoice: profile.brandVoice || undefined,
    productsServices: profile.productsServices || undefined,
    notes: profile.notes || undefined,
  }

  return Object.fromEntries(Object.entries(context).filter(([, value]) => Boolean(value)))
}
