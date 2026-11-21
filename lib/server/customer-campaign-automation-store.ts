import { createHash, randomUUID } from "node:crypto"
import { Redis } from "@upstash/redis"
import { isStableCustomerSubject } from "@/lib/auth"
import {
  buildCustomerCampaignPreview,
  customerCampaignAutomationInputSchema,
  customerCampaignAutomationRecordSchema,
  type CustomerCampaignAutomationInput,
  type CustomerCampaignAutomationRecord,
  type CustomerCampaignAutomationStatus,
} from "@/lib/server/customer-campaign-automation"

const PREFIX = "ams:customer-campaign-automation:v1"
const TTL = 90 * 24 * 60 * 60
const MAX_RECENT = 20

type RedisClient = Pick<Redis, "eval" | "get" | "lrange">
type Options = { redis?: RedisClient; now?: () => Date; newId?: () => string }

const CREATE_SCRIPT = [
  "local existing = redis.call('GET', KEYS[1])",
  "if existing then",
  "  if string.sub(existing, 1, 64) ~= ARGV[1] then return {'conflict'} end",
  "  return {'existing', string.sub(existing, 66)}",
  "end",
  "redis.call('SET', KEYS[1], ARGV[1] .. ':' .. ARGV[2], 'EX', tonumber(ARGV[3]))",
  "redis.call('SET', KEYS[2], ARGV[2], 'EX', tonumber(ARGV[3]))",
  "redis.call('LPUSH', KEYS[3], ARGV[4])",
  "redis.call('LTRIM', KEYS[3], 0, tonumber(ARGV[5]) - 1)",
  "redis.call('EXPIRE', KEYS[3], tonumber(ARGV[3]))",
  "return {'created', ARGV[2]}",
].join("\n")

const UPDATE_SCRIPT = [
  "local current = redis.call('GET', KEYS[1])",
  "if not current then return {'not_found'} end",
  "local ok, decoded = pcall(cjson.decode, current)",
  "if not ok then return {'corrupt'} end",
  "if decoded['ownerSubject'] ~= ARGV[1] then return {'forbidden'} end",
  "if tonumber(decoded['revision']) ~= tonumber(ARGV[2]) then return {'conflict'} end",
  "redis.call('SET', KEYS[1], ARGV[3], 'EX', tonumber(ARGV[4]))",
  "return {'updated', ARGV[3]}",
].join("\n")

function hash(value: string) { return createHash("sha256").update(value).digest("hex") }
function ownerKeys(subject: string) {
  if (!isStableCustomerSubject(subject)) throw new Error("AUTOMATION_INVALID_OWNER")
  const digest = hash(subject)
  return { prefix: digest, index: PREFIX + ":owner:" + digest + ":recent" }
}
function recordKey(id: string) { return PREFIX + ":record:" + id }
function normalizeRaw(value: unknown): unknown {
  if (typeof value !== "string") return value
  try { return JSON.parse(value) } catch { return null }
}
function asRecord(value: unknown): CustomerCampaignAutomationRecord {
  return customerCampaignAutomationRecordSchema.parse(normalizeRaw(value))
}
function requireOwned(value: unknown, subject: string) {
  const record = asRecord(value)
  if (record.ownerSubject !== subject) throw new Error("AUTOMATION_OWNER_MISMATCH")
  return record
}
function redisFrom(options: Options) {
  if (options.redis) return options.redis
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)?.trim()
  if (!url || !token) throw new Error("AUTOMATION_STORE_UNAVAILABLE")
  return new Redis({ url, token })
}
export type AutomationStoreOptions = Options

export async function createCustomerCampaignAutomation(
  ownerSubject: string,
  input: CustomerCampaignAutomationInput,
  sourceRunUpdatedAt: string,
  options: Options = {},
): Promise<{ created: boolean; record: CustomerCampaignAutomationRecord }> {
  const owner = ownerKeys(ownerSubject)
  const data = customerCampaignAutomationInputSchema.parse(input)
  const now = (options.now ?? (() => new Date()))()
  const preview = buildCustomerCampaignPreview(data, now)
  const id = (options.newId ?? randomUUID)()
  const fingerprint = hash(JSON.stringify({ ...data, idempotencyKey: undefined, sourceRunUpdatedAt }))
  const timestamp = now.toISOString()
  const record = customerCampaignAutomationRecordSchema.parse({
    id, ownerSubject, idempotencyKey: data.idempotencyKey, fingerprint,
    kind: data.kind, title: data.title, sourceRunId: data.sourceRunId,
    sourceRunUpdatedAt, sequenceLength: data.sequenceLength, cadenceDays: data.cadenceDays,
    startAt: new Date(data.startAt).toISOString(), preview,
    status: "draft", deliveryEnabled: false, recipientCount: 0,
    reviewedAt: null, pausedAt: null, revision: 0,
    createdAt: timestamp, updatedAt: timestamp,
  })
  const redis = redisFrom(options)
  const idem = PREFIX + ":owner:" + owner.prefix + ":idem:" + hash(data.idempotencyKey)
  const result = await redis.eval(
    CREATE_SCRIPT, [idem, recordKey(id), owner.index],
    [fingerprint, JSON.stringify(record), TTL, id, MAX_RECENT],
  )
  if (!Array.isArray(result)) throw new Error("AUTOMATION_STORE_INVALID_RESULT")
  if (result[0] === "conflict") throw new Error("AUTOMATION_IDEMPOTENCY_CONFLICT")
  if (result[0] !== "created" && result[0] !== "existing") {
    throw new Error("AUTOMATION_STORE_INVALID_RESULT")
  }
  const saved = requireOwned(result[1], ownerSubject)
  const current = await redis.get<unknown>(recordKey(saved.id))
  if (!current) throw new Error("AUTOMATION_STORE_UNAVAILABLE")
  return { created: result[0] === "created", record: requireOwned(current, ownerSubject) }
}

export async function listCustomerCampaignAutomations(
  ownerSubject: string,
  options: Options = {},
): Promise<CustomerCampaignAutomationRecord[]> {
  const keys = ownerKeys(ownerSubject)
  const redis = redisFrom(options)
  const ids = await redis.lrange<string>(keys.index, 0, MAX_RECENT - 1)
  const records = await Promise.all(ids.map((id) => redis.get<unknown>(recordKey(id))))
  return records.filter((value): value is NonNullable<typeof value> => value !== null && value !== undefined)
    .map((value) => requireOwned(value, ownerSubject))
}

export async function updateCustomerCampaignAutomation(
  ownerSubject: string,
  id: string,
  action: "review" | "pause",
  options: Options = {},
): Promise<CustomerCampaignAutomationRecord | null> {
  ownerKeys(ownerSubject)
  if (!/^[0-9a-f-]{36}$/.test(id)) return null
  const redis = redisFrom(options)
  const current = await redis.get<unknown>(recordKey(id))
  if (current === null) return null
  const record = requireOwned(current, ownerSubject)
  if ((action === "review" && record.status === "reviewed") ||
      (action === "pause" && record.status === "paused")) return record
  if (action === "review" && record.status !== "draft") {
    throw new Error("AUTOMATION_INVALID_TRANSITION")
  }
  const now = (options.now ?? (() => new Date()))().toISOString()
  const status: CustomerCampaignAutomationStatus = action === "review" ? "reviewed" : "paused"
  const next = customerCampaignAutomationRecordSchema.parse({
    ...record, status, updatedAt: now, revision: record.revision + 1,
    reviewedAt: action === "review" ? now : record.reviewedAt,
    pausedAt: action === "pause" ? now : record.pausedAt,
    deliveryEnabled: false, recipientCount: 0,
  })
  const result = await redis.eval(
    UPDATE_SCRIPT, [recordKey(id)],
    [ownerSubject, record.revision, JSON.stringify(next), TTL],
  )
  if (!Array.isArray(result)) throw new Error("AUTOMATION_STORE_INVALID_RESULT")
  if (result[0] === "not_found") return null
  if (result[0] === "conflict") throw new Error("AUTOMATION_REVISION_CONFLICT")
  if (result[0] !== "updated") throw new Error("AUTOMATION_STORE_INVALID_RESULT")
  return requireOwned(result[1], ownerSubject)
}
