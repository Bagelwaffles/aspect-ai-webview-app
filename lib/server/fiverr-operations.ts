import { Redis } from "@upstash/redis"

import type { NormalizedFiverrEvent } from "@/lib/server/fiverr-bridge"

const INDEX_KEY = "ams:fiverr:operations:recent"
const RECORD_PREFIX = "ams:fiverr:operation:"
const RECORD_TTL_SECONDS = 60 * 60 * 24 * 90
const MAX_INDEXED_RECORDS = 100

export type FiverrOperationRecord = {
  event_id: string
  event_type: NormalizedFiverrEvent["event_type"]
  priority: NormalizedFiverrEvent["priority"]
  recommended_action: NormalizedFiverrEvent["recommended_action"]
  subject: string
  received_at: string | null
  recorded_at: string
  order_reference: string | null
  buyer_username: string | null
  deadline_at: string | null
  deadline_hint: string | null
  service_slug: NormalizedFiverrEvent["service_slug"]
  quick_audit_match: boolean
  human_approval_required: true
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

function toRecord(event: NormalizedFiverrEvent): FiverrOperationRecord {
  return {
    event_id: event.event_id,
    event_type: event.event_type,
    priority: event.priority,
    recommended_action: event.recommended_action,
    subject: event.subject.slice(0, 500),
    received_at: event.received_at,
    recorded_at: new Date().toISOString(),
    order_reference: event.order_reference,
    buyer_username: event.buyer_username,
    deadline_at: event.deadline_at,
    deadline_hint: event.deadline_hint,
    service_slug: event.service_slug,
    quick_audit_match: event.quick_audit_match,
    human_approval_required: true,
  }
}

export async function recordFiverrOperation(
  event: NormalizedFiverrEvent,
): Promise<"recorded" | "duplicate" | "unavailable"> {
  const redis = createClient()
  if (!redis) return "unavailable"

  const record = toRecord(event)
  const recordKey = `${RECORD_PREFIX}${record.event_id}`

  try {
    const result = await redis.set(recordKey, JSON.stringify(record), {
      nx: true,
      ex: RECORD_TTL_SECONDS,
    })

    if (result !== "OK") return "duplicate"

    await redis.lpush(INDEX_KEY, record.event_id)
    await redis.ltrim(INDEX_KEY, 0, MAX_INDEXED_RECORDS - 1)
    await redis.expire(INDEX_KEY, RECORD_TTL_SECONDS)
    return "recorded"
  } catch {
    return "unavailable"
  }
}

function parseRecord(value: unknown): FiverrOperationRecord | null {
  if (typeof value !== "string") return null

  try {
    const parsed = JSON.parse(value) as Partial<FiverrOperationRecord>
    if (!parsed.event_id || !parsed.event_type || !parsed.priority || !parsed.recommended_action) {
      return null
    }

    return {
      event_id: parsed.event_id,
      event_type: parsed.event_type,
      priority: parsed.priority,
      recommended_action: parsed.recommended_action,
      subject: typeof parsed.subject === "string" ? parsed.subject : "",
      received_at: typeof parsed.received_at === "string" ? parsed.received_at : null,
      recorded_at: typeof parsed.recorded_at === "string" ? parsed.recorded_at : "",
      order_reference: typeof parsed.order_reference === "string" ? parsed.order_reference : null,
      buyer_username: typeof parsed.buyer_username === "string" ? parsed.buyer_username : null,
      deadline_at: typeof parsed.deadline_at === "string" ? parsed.deadline_at : null,
      deadline_hint: typeof parsed.deadline_hint === "string" ? parsed.deadline_hint : null,
      service_slug: parsed.service_slug === "quick-marketing-audit" ? parsed.service_slug : null,
      quick_audit_match: parsed.quick_audit_match === true,
      human_approval_required: true,
    }
  } catch {
    return null
  }
}

export async function listRecentFiverrOperations(limit = 8): Promise<FiverrOperationRecord[]> {
  const redis = createClient()
  if (!redis) return []

  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 25)

  try {
    const ids = await redis.lrange<string[]>(INDEX_KEY, 0, safeLimit - 1)
    if (!ids.length) return []

    const values = await Promise.all(ids.map((eventId) => redis.get<string>(`${RECORD_PREFIX}${eventId}`)))
    return values.map(parseRecord).filter((record): record is FiverrOperationRecord => Boolean(record))
  } catch {
    return []
  }
}
