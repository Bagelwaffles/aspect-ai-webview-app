import { createHash } from "node:crypto"

import { Redis } from "@upstash/redis"

import { isStableCustomerSubject } from "@/lib/auth"
import { isAcademyLessonId, type AcademyLessonId } from "@/lib/academy/catalog"

const PREFIX = "ams:academy:progress:v1"

export type AcademyRedisStore = {
  smembers(key: string): Promise<unknown>
  sadd(key: string, member: string): Promise<unknown>
}

export type AcademyProgressOptions = { redis?: AcademyRedisStore | null }

export function academyProgressKey(subject: string): string {
  if (!isStableCustomerSubject(subject)) throw new Error("ACADEMY_INVALID_CUSTOMER")
  // Do not put email or the signed identity subject directly in a Redis key.
  return `${PREFIX}:${createHash("sha256").update(subject).digest("hex")}`
}

export function resolveAcademyRedisConfig(
  env: Record<string, string | undefined> = process.env,
): { url: string; token: string } | null {
  // Dedicated Academy credentials only: never inherit generic AMS Preview/Production
  // Redis, buyer-link, Stripe, Gmail monitoring, or other agents' data stores.
  const url = env.AMS_ACADEMY_REDIS_REST_URL?.trim()
  const token = env.AMS_ACADEMY_REDIS_REST_TOKEN?.trim()
  return url && token ? { url, token } : null
}

function progressStore(options: AcademyProgressOptions): AcademyRedisStore {
  if (Object.prototype.hasOwnProperty.call(options, "redis")) {
    if (!options.redis) throw new Error("ACADEMY_PROGRESS_STORE_UNAVAILABLE")
    return options.redis
  }
  const config = resolveAcademyRedisConfig()
  if (!config) throw new Error("ACADEMY_PROGRESS_STORE_UNAVAILABLE")
  return new Redis(config)
}

/** Server-only, owner-scoped and never inferred from browser-local data. */
export async function getAcademyCompletedLessons(
  subject: string,
  options: AcademyProgressOptions = {},
): Promise<AcademyLessonId[]> {
  const key = academyProgressKey(subject)
  const raw = await progressStore(options).smembers(key)
  if (!Array.isArray(raw)) throw new Error("ACADEMY_PROGRESS_INVALID_RESPONSE")

  // Ignore unknown IDs from old versions or corrupt data rather than
  // displaying false course completion.
  const unique = new Set<AcademyLessonId>()
  for (const value of raw) {
    if (isAcademyLessonId(value)) unique.add(value)
  }
  return [...unique]
}

/** Idempotent completion: Redis SADD records one lesson only once. */
export async function markAcademyLessonComplete(
  subject: string,
  lessonId: unknown,
  options: AcademyProgressOptions = {},
): Promise<void> {
  const key = academyProgressKey(subject)
  if (!isAcademyLessonId(lessonId)) throw new Error("ACADEMY_INVALID_LESSON")
  await progressStore(options).sadd(key, lessonId)
}
