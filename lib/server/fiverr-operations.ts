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

export function fiverrOperationRecordFromEvent(
  event: NormalizedFiverrEvent,
  recordedAt = new Date().toISOString(),
): FiverrOperationRecord {
  return {
    event_id: event.event_id,
    event_type: event.event_type,
    priority: event.priority,
    recommended_action: event.recommended_action,
    subject: event.subject.slice(0, 500),
    received_at: event.received_at,
    recorded_at: recordedAt,
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

  const record = fiverrOperationRecordFromEvent(event)
  const recordKey = `${RECORD_PREFIX}${record.event_id}`

  try {
    const result = await redis.set(recordKey, record, {
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
  let parsed: unknown = value

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return null
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
  const record = parsed as Partial<FiverrOperationRecord>

  if (!record.event_id || !record.event_type || !record.priority || !record.recommended_action) {
    return null
  }

  return {
    event_id: record.event_id,
    event_type: record.event_type,
    priority: record.priority,
    recommended_action: record.recommended_action,
    subject: typeof record.subject === "string" ? record.subject : "",
    received_at: typeof record.received_at === "string" ? record.received_at : null,
    recorded_at: typeof record.recorded_at === "string" ? record.recorded_at : "",
    order_reference: typeof record.order_reference === "string" ? record.order_reference : null,
    buyer_username: typeof record.buyer_username === "string" ? record.buyer_username : null,
    deadline_at: typeof record.deadline_at === "string" ? record.deadline_at : null,
    deadline_hint: typeof record.deadline_hint === "string" ? record.deadline_hint : null,
    service_slug: record.service_slug === "quick-marketing-audit" ? record.service_slug : null,
    quick_audit_match: record.quick_audit_match === true,
    human_approval_required: true,
  }
}

export async function listRecentFiverrOperations(limit = 8): Promise<FiverrOperationRecord[]> {
  const redis = createClient()
  if (!redis) return []

  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 25)

  try {
    const ids = await redis.lrange<string>(INDEX_KEY, 0, safeLimit - 1)
    if (!ids.length) return []

    const values = await Promise.all(
      ids.map((eventId) => redis.get<FiverrOperationRecord>(`${RECORD_PREFIX}${eventId}`)),
    )

    return values.map(parseRecord).filter((record): record is FiverrOperationRecord => Boolean(record))
  } catch {
    return []
  }
}
