import { createHash, randomUUID } from "node:crypto"

import { Redis } from "@upstash/redis"

const TESTER_INDEX_KEY = "ams:android-beta:testers:recent"
const TESTER_RECORD_PREFIX = "ams:android-beta:tester:"
const FEEDBACK_INDEX_KEY = "ams:android-beta:feedback:recent"
const FEEDBACK_RECORD_PREFIX = "ams:android-beta:feedback:"
const TESTER_TTL_SECONDS = 60 * 60 * 24 * 120
const FEEDBACK_TTL_SECONDS = 60 * 60 * 24 * 120
const MAX_TESTERS = 250
const MAX_FEEDBACK = 500

export const GOOGLE_CLOSED_TEST_MINIMUM = 12
export const GOOGLE_CLOSED_TEST_DAYS = 14
export const AMS_RECRUITMENT_GOAL = 18

export type AndroidBetaTesterLead = {
  id: string
  first_name: string
  email: string
  android_device: string
  commitment_14_days: true
  source: string | null
  notes: string | null
  created_at: string
  feedback_count: number
}

export type AndroidBetaFeedback = {
  id: string
  tester_id: string
  rating: number
  device: string | null
  what_worked: string
  issue: string | null
  suggestion: string | null
  created_at: string
}

export type AndroidBetaJoinInput = {
  firstName: string
  email: string
  androidDevice: string
  source?: string | null
  notes?: string | null
}

export type AndroidBetaFeedbackInput = {
  email: string
  rating: number
  device?: string | null
  whatWorked: string
  issue?: string | null
  suggestion?: string | null
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

export function normalizeBetaTesterEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function betaTesterIdFromEmail(value: string): string {
  return createHash("sha256").update(normalizeBetaTesterEmail(value)).digest("hex").slice(0, 24)
}

export function buildAndroidBetaTesterLead(
  input: AndroidBetaJoinInput,
  createdAt = new Date().toISOString(),
): AndroidBetaTesterLead {
  const email = normalizeBetaTesterEmail(input.email)
  return {
    id: betaTesterIdFromEmail(email),
    first_name: input.firstName.trim().replace(/\s+/g, " ").slice(0, 80),
    email,
    android_device: input.androidDevice.trim().replace(/\s+/g, " ").slice(0, 120),
    commitment_14_days: true,
    source: cleanText(input.source, 80),
    notes: cleanText(input.notes, 600),
    created_at: createdAt,
    feedback_count: 0,
  }
}

function parseTester(value: unknown): AndroidBetaTesterLead | null {
  let parsed: unknown = value
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return null
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
  const record = parsed as Partial<AndroidBetaTesterLead>
  if (!record.id || !record.email || !record.first_name || !record.android_device || !record.created_at) {
    return null
  }

  return {
    id: record.id,
    first_name: record.first_name,
    email: record.email,
    android_device: record.android_device,
    commitment_14_days: true,
    source: typeof record.source === "string" ? record.source : null,
    notes: typeof record.notes === "string" ? record.notes : null,
    created_at: record.created_at,
    feedback_count: Number.isFinite(record.feedback_count) ? Number(record.feedback_count) : 0,
  }
}

export async function joinAndroidBetaTester(
  input: AndroidBetaJoinInput,
): Promise<{ status: "recorded" | "existing" | "unavailable"; tester: AndroidBetaTesterLead | null }> {
  const redis = createClient()
  if (!redis) return { status: "unavailable", tester: null }

  const tester = buildAndroidBetaTesterLead(input)
  const recordKey = `${TESTER_RECORD_PREFIX}${tester.id}`

  try {
    const result = await redis.set(recordKey, tester, { nx: true, ex: TESTER_TTL_SECONDS })
    if (result === "OK") {
      await redis.lpush(TESTER_INDEX_KEY, tester.id)
      await redis.ltrim(TESTER_INDEX_KEY, 0, MAX_TESTERS - 1)
      await redis.expire(TESTER_INDEX_KEY, TESTER_TTL_SECONDS)
      return { status: "recorded", tester }
    }

    const existing = parseTester(await redis.get<AndroidBetaTesterLead>(recordKey))
    return { status: "existing", tester: existing }
  } catch {
    return { status: "unavailable", tester: null }
  }
}

export async function recordAndroidBetaFeedback(
  input: AndroidBetaFeedbackInput,
): Promise<"recorded" | "tester_not_found" | "unavailable"> {
  const redis = createClient()
  if (!redis) return "unavailable"

  const testerId = betaTesterIdFromEmail(input.email)
  const testerKey = `${TESTER_RECORD_PREFIX}${testerId}`

  try {
    const tester = parseTester(await redis.get<AndroidBetaTesterLead>(testerKey))
    if (!tester) return "tester_not_found"

    const feedback: AndroidBetaFeedback = {
      id: randomUUID(),
      tester_id: testerId,
      rating: Math.min(Math.max(Math.round(input.rating), 1), 5),
      device: cleanText(input.device, 120),
      what_worked: input.whatWorked.trim().slice(0, 1000),
      issue: cleanText(input.issue, 1500),
      suggestion: cleanText(input.suggestion, 1500),
      created_at: new Date().toISOString(),
    }

    await redis.set(`${FEEDBACK_RECORD_PREFIX}${feedback.id}`, feedback, { ex: FEEDBACK_TTL_SECONDS })
    await redis.lpush(FEEDBACK_INDEX_KEY, feedback.id)
    await redis.ltrim(FEEDBACK_INDEX_KEY, 0, MAX_FEEDBACK - 1)
    await redis.expire(FEEDBACK_INDEX_KEY, FEEDBACK_TTL_SECONDS)

    tester.feedback_count += 1
    await redis.set(testerKey, tester, { ex: TESTER_TTL_SECONDS })
    return "recorded"
  } catch {
    return "unavailable"
  }
}

export async function listAndroidBetaTesters(limit = 100): Promise<AndroidBetaTesterLead[]> {
  const redis = createClient()
  if (!redis) return []

  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 250)
  try {
    const ids = await redis.lrange<string>(TESTER_INDEX_KEY, 0, safeLimit - 1)
    if (!ids.length) return []

    const values = await Promise.all(
      ids.map((id) => redis.get<AndroidBetaTesterLead>(`${TESTER_RECORD_PREFIX}${id}`)),
    )

    return values.map(parseTester).filter((value): value is AndroidBetaTesterLead => Boolean(value))
  } catch {
    return []
  }
}

function parseFeedback(value: unknown): AndroidBetaFeedback | null {
  let parsed: unknown = value
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return null
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
  const record = parsed as Partial<AndroidBetaFeedback>
  if (!record.id || !record.tester_id || !record.created_at || !record.what_worked) return null

  return {
    id: record.id,
    tester_id: record.tester_id,
    rating: Number.isFinite(record.rating) ? Math.min(Math.max(Number(record.rating), 1), 5) : 1,
    device: typeof record.device === "string" ? record.device : null,
    what_worked: record.what_worked,
    issue: typeof record.issue === "string" ? record.issue : null,
    suggestion: typeof record.suggestion === "string" ? record.suggestion : null,
    created_at: record.created_at,
  }
}

export async function listAndroidBetaFeedback(limit = 50): Promise<AndroidBetaFeedback[]> {
  const redis = createClient()
  if (!redis) return []

  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100)
  try {
    const ids = await redis.lrange<string>(FEEDBACK_INDEX_KEY, 0, safeLimit - 1)
    if (!ids.length) return []
    const values = await Promise.all(
      ids.map((id) => redis.get<AndroidBetaFeedback>(`${FEEDBACK_RECORD_PREFIX}${id}`)),
    )
    return values.map(parseFeedback).filter((value): value is AndroidBetaFeedback => Boolean(value))
  } catch {
    return []
  }
}
