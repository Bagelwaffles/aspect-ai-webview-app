import { createHash, randomUUID } from "node:crypto"

import { Redis } from "@upstash/redis"

const APPLICATION_INDEX_KEY = "ams:creator-pilot:applications:recent"
const APPLICATION_RECORD_PREFIX = "ams:creator-pilot:application:"
const RATE_LIMIT_PREFIX = "ams:creator-pilot:rate:"
const APPLICATION_TTL_SECONDS = 60 * 60 * 24 * 180
const RATE_LIMIT_TTL_SECONDS = 60 * 60
const MAX_APPLICATIONS = 500
const RATE_LIMIT_MAX = 5

export const CREATOR_PILOT_RETENTION_DAYS = 180

export const CREATOR_PLATFORM_VALUES = [
  "twitch",
  "youtube",
  "tiktok",
  "kick",
  "facebook",
  "other",
] as const

export type CreatorPlatform = (typeof CREATOR_PLATFORM_VALUES)[number]

export type CreatorPilotInput = {
  name: string
  email: string
  creatorHandle: string
  primaryPlatform: CreatorPlatform
  platforms: CreatorPlatform[]
  primaryGame?: string | null
  creatorCategories: string[]
  goals: string
  biggestBottleneck: string
  currentSetup?: string | null
  weeklyStreamHours?: number | null
  source?: string | null
}

export type CreatorPilotApplication = {
  id: string
  application_id: string
  name: string
  email: string
  creator_handle: string
  primary_platform: CreatorPlatform
  platforms: CreatorPlatform[]
  primary_game: string | null
  creator_categories: string[]
  goals: string
  biggest_bottleneck: string
  current_setup: string | null
  weekly_stream_hours: number | null
  source: string | null
  consent_contact: true
  status: "pilot_request"
  created_at: string
  updated_at: string
}

function redisConfiguration(): { url: string; token: string } | null {
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)?.trim()
  return url && token ? { url, token } : null
}

function createClient(): Redis | null {
  const configuration = redisConfiguration()
  return configuration ? new Redis(configuration) : null
}

function cleanText(value: string | null | undefined, maxLength: number): string | null {
  const cleaned = value?.trim().replace(/\s+/g, " ") ?? ""
  return cleaned ? cleaned.slice(0, maxLength) : null
}

function cleanList(values: string[], maxItems: number, maxLength: number): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => cleanText(value, maxLength))
        .filter((value): value is string => Boolean(value)),
    ),
  ).slice(0, maxItems)
}

export function normalizeCreatorPilotEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function creatorPilotIdFromEmail(value: string): string {
  return createHash("sha256").update(normalizeCreatorPilotEmail(value)).digest("hex").slice(0, 24)
}

export function buildCreatorPilotApplication(
  input: CreatorPilotInput,
  createdAt = new Date().toISOString(),
  applicationId = randomUUID(),
): CreatorPilotApplication {
  const email = normalizeCreatorPilotEmail(input.email)
  const weeklyHours =
    typeof input.weeklyStreamHours === "number" && Number.isFinite(input.weeklyStreamHours)
      ? Math.min(Math.max(Math.round(input.weeklyStreamHours), 0), 100)
      : null

  const platforms = Array.from(new Set([input.primaryPlatform, ...input.platforms])).filter(
    (value): value is CreatorPlatform => CREATOR_PLATFORM_VALUES.includes(value),
  )

  return {
    id: creatorPilotIdFromEmail(email),
    application_id: applicationId,
    name: input.name.trim().replace(/\s+/g, " ").slice(0, 100),
    email,
    creator_handle: input.creatorHandle.trim().replace(/\s+/g, " ").slice(0, 80),
    primary_platform: input.primaryPlatform,
    platforms: platforms.slice(0, CREATOR_PLATFORM_VALUES.length),
    primary_game: cleanText(input.primaryGame, 120),
    creator_categories: cleanList(input.creatorCategories, 8, 60),
    goals: input.goals.trim().slice(0, 1200),
    biggest_bottleneck: input.biggestBottleneck.trim().slice(0, 1200),
    current_setup: cleanText(input.currentSetup, 1000),
    weekly_stream_hours: weeklyHours,
    source: cleanText(input.source, 120),
    consent_contact: true,
    status: "pilot_request",
    created_at: createdAt,
    updated_at: createdAt,
  }
}

function parseApplication(value: unknown): CreatorPilotApplication | null {
  let parsed: unknown = value
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return null
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
  const record = parsed as Partial<CreatorPilotApplication>
  if (
    !record.id ||
    !record.application_id ||
    !record.name ||
    !record.email ||
    !record.creator_handle ||
    !record.primary_platform ||
    !record.created_at ||
    !record.updated_at
  ) {
    return null
  }

  if (!CREATOR_PLATFORM_VALUES.includes(record.primary_platform)) return null

  const platforms = Array.isArray(record.platforms)
    ? record.platforms.filter((value): value is CreatorPlatform =>
        CREATOR_PLATFORM_VALUES.includes(value as CreatorPlatform),
      )
    : [record.primary_platform]

  return {
    id: record.id,
    application_id: record.application_id,
    name: record.name,
    email: record.email,
    creator_handle: record.creator_handle,
    primary_platform: record.primary_platform,
    platforms,
    primary_game: typeof record.primary_game === "string" ? record.primary_game : null,
    creator_categories: Array.isArray(record.creator_categories)
      ? record.creator_categories.filter((value): value is string => typeof value === "string")
      : [],
    goals: typeof record.goals === "string" ? record.goals : "",
    biggest_bottleneck:
      typeof record.biggest_bottleneck === "string" ? record.biggest_bottleneck : "",
    current_setup: typeof record.current_setup === "string" ? record.current_setup : null,
    weekly_stream_hours:
      typeof record.weekly_stream_hours === "number" && Number.isFinite(record.weekly_stream_hours)
        ? record.weekly_stream_hours
        : null,
    source: typeof record.source === "string" ? record.source : null,
    consent_contact: true,
    status: "pilot_request",
    created_at: record.created_at,
    updated_at: record.updated_at,
  }
}

export async function saveCreatorPilotApplication(
  input: CreatorPilotInput,
): Promise<{
  status: "recorded" | "updated" | "unavailable"
  application: CreatorPilotApplication | null
}> {
  const redis = createClient()
  if (!redis) return { status: "unavailable", application: null }

  const next = buildCreatorPilotApplication(input)
  const recordKey = `${APPLICATION_RECORD_PREFIX}${next.id}`

  try {
    const existing = parseApplication(await redis.get<CreatorPilotApplication>(recordKey))
    const application: CreatorPilotApplication = existing
      ? {
          ...next,
          application_id: existing.application_id,
          created_at: existing.created_at,
          updated_at: new Date().toISOString(),
        }
      : next

    await redis.set(recordKey, application, { ex: APPLICATION_TTL_SECONDS })

    if (!existing) {
      await redis.lpush(APPLICATION_INDEX_KEY, application.id)
      await redis.ltrim(APPLICATION_INDEX_KEY, 0, MAX_APPLICATIONS - 1)
    }
    await redis.expire(APPLICATION_INDEX_KEY, APPLICATION_TTL_SECONDS)

    return { status: existing ? "updated" : "recorded", application }
  } catch {
    return { status: "unavailable", application: null }
  }
}

export async function consumeCreatorPilotRateLimit(fingerprint: string): Promise<{
  allowed: boolean
  available: boolean
  retryAfterSeconds: number
}> {
  const redis = createClient()
  if (!redis) return { allowed: false, available: false, retryAfterSeconds: RATE_LIMIT_TTL_SECONDS }

  const digest = createHash("sha256").update(fingerprint.trim() || "unknown").digest("hex")
  const key = `${RATE_LIMIT_PREFIX}${digest}`

  try {
    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, RATE_LIMIT_TTL_SECONDS)
    const ttl = await redis.ttl(key)
    return {
      allowed: count <= RATE_LIMIT_MAX,
      available: true,
      retryAfterSeconds: Math.max(1, ttl > 0 ? ttl : RATE_LIMIT_TTL_SECONDS),
    }
  } catch {
    return { allowed: false, available: false, retryAfterSeconds: RATE_LIMIT_TTL_SECONDS }
  }
}

export async function listCreatorPilotApplications(limit = 100): Promise<CreatorPilotApplication[]> {
  const redis = createClient()
  if (!redis) return []

  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 250)
  try {
    const ids = await redis.lrange<string>(APPLICATION_INDEX_KEY, 0, safeLimit - 1)
    if (!ids.length) return []

    const values = await Promise.all(
      ids.map((id) => redis.get<CreatorPilotApplication>(`${APPLICATION_RECORD_PREFIX}${id}`)),
    )

    return values.map(parseApplication).filter((value): value is CreatorPilotApplication => Boolean(value))
  } catch {
    return []
  }
}
