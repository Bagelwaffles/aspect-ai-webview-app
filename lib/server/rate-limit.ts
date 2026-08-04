import { createHash } from "node:crypto"

import { Redis } from "@upstash/redis"

import { isStableCustomerSubject } from "@/lib/auth"

type RateLimitBucket = {
  count: number
  resetAt: number
}

type RateLimitStore = Map<string, RateLimitBucket>

type GlobalWithRateLimits = typeof globalThis & {
  __amsRateLimits?: RateLimitStore
}

export type AiRateLimitStorageCommand = {
  key: string
  windowMs: number
}

export type AiRateLimitStorageResult = {
  count: number
  resetInMs: number
}

export interface AiRateLimitAdapter {
  increment(command: AiRateLimitStorageCommand): Promise<AiRateLimitStorageResult>
}

export type DistributedAiRateLimitInput = {
  subject: string
  operation: string
  limit?: number
  windowMs?: number
}

export type DistributedAiRateLimitResult = {
  allowed: boolean
  available: boolean
  code: "OK" | "AI_RATE_LIMITED" | "RATE_LIMIT_UNAVAILABLE" | "RATE_LIMIT_INVALID_IDENTITY"
  limit: number
  remaining: number
  resetAt: number
  retryAfterSeconds: number
  distributed: true
}

const DISTRIBUTED_INCREMENT_SCRIPT = `
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
  end

  local ttl = redis.call('PTTL', KEYS[1])
  if ttl < 1 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
    ttl = tonumber(ARGV[1])
  end

  return {tostring(count), tostring(ttl)}
`

const globalStore = globalThis as GlobalWithRateLimits
const store = globalStore.__amsRateLimits ?? new Map<string, RateLimitBucket>()
globalStore.__amsRateLimits = store

function clampInteger(raw: unknown, fallback: number, minimum: number, maximum: number): number {
  const parsed = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10)
  if (!Number.isSafeInteger(parsed)) return fallback
  return Math.min(maximum, Math.max(minimum, parsed))
}

function configuredLimit(override?: number): number {
  return clampInteger(override ?? process.env.AMS_AI_REQUESTS_PER_MINUTE, 10, 1, 60)
}

function configuredWindow(override?: number): number {
  return clampInteger(override, 60_000, 1_000, 3_600_000)
}

function cleanupExpired(now: number) {
  if (store.size < 2000) return

  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key)
  }
}

function storageKey(subject: string, operation: string): string {
  const digest = createHash("sha256")
    .update(`${subject}\u0000${operation}`)
    .digest("hex")

  return `ams:rate-limit:ai:${digest}`
}

function isValidOperation(operation: string): boolean {
  return /^[a-z][a-z0-9:_-]{0,63}$/.test(operation)
}

function deniedUnavailable(
  code: "RATE_LIMIT_UNAVAILABLE" | "RATE_LIMIT_INVALID_IDENTITY",
  limit: number,
  windowMs: number,
  now: number,
): DistributedAiRateLimitResult {
  return {
    allowed: false,
    available: false,
    code,
    limit,
    remaining: 0,
    resetAt: now + windowMs,
    retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1000)),
    distributed: true,
  }
}

function parseStorageResult(raw: unknown): AiRateLimitStorageResult {
  if (!Array.isArray(raw) || raw.length < 2) {
    throw new Error("Invalid rate-limit datastore response")
  }

  const count = Number(raw[0])
  const resetInMs = Number(raw[1])
  if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(resetInMs) || resetInMs < 1) {
    throw new Error("Invalid rate-limit datastore response")
  }

  return { count, resetInMs }
}

export class UpstashAiRateLimitAdapter implements AiRateLimitAdapter {
  constructor(private readonly redis: Pick<Redis, "eval">) {}

  async increment(command: AiRateLimitStorageCommand): Promise<AiRateLimitStorageResult> {
    const raw = await this.redis.eval(
      DISTRIBUTED_INCREMENT_SCRIPT,
      [command.key],
      [command.windowMs],
    )

    return parseStorageResult(raw)
  }
}

export class DistributedAiRateLimiter {
  constructor(
    private readonly adapter: AiRateLimitAdapter,
    private readonly now: () => number = Date.now,
  ) {}

  async consume(input: DistributedAiRateLimitInput): Promise<DistributedAiRateLimitResult> {
    const now = this.now()
    const limit = configuredLimit(input.limit)
    const windowMs = configuredWindow(input.windowMs)
    const subject = input.subject.trim()
    const operation = input.operation.trim().toLowerCase()

    if (!isStableCustomerSubject(subject) || !isValidOperation(operation)) {
      return deniedUnavailable("RATE_LIMIT_INVALID_IDENTITY", limit, windowMs, now)
    }

    try {
      const result = await this.adapter.increment({
        key: storageKey(subject, operation),
        windowMs,
      })

      if (
        !Number.isSafeInteger(result.count) ||
        result.count < 1 ||
        !Number.isSafeInteger(result.resetInMs) ||
        result.resetInMs < 1
      ) {
        return deniedUnavailable("RATE_LIMIT_UNAVAILABLE", limit, windowMs, now)
      }

      const allowed = result.count <= limit
      return {
        allowed,
        available: true,
        code: allowed ? "OK" : "AI_RATE_LIMITED",
        limit,
        remaining: Math.max(0, limit - result.count),
        resetAt: now + result.resetInMs,
        retryAfterSeconds: Math.max(1, Math.ceil(result.resetInMs / 1000)),
        distributed: true,
      }
    } catch {
      return deniedUnavailable("RATE_LIMIT_UNAVAILABLE", limit, windowMs, now)
    }
  }
}

function defaultDistributedAdapter(): AiRateLimitAdapter | null {
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)?.trim()
  if (!url || !token) return null

  return new UpstashAiRateLimitAdapter(new Redis({ url, token }))
}

/**
 * Distributed, atomic AI limiter foundation. Callers must await this result and
 * treat `available: false` as a closed gate (normally HTTP 503).
 */
export async function consumeDistributedAiRateLimit(
  input: DistributedAiRateLimitInput,
  adapter: AiRateLimitAdapter | null = defaultDistributedAdapter(),
): Promise<DistributedAiRateLimitResult> {
  const limit = configuredLimit(input.limit)
  const windowMs = configuredWindow(input.windowMs)
  if (!adapter) {
    return deniedUnavailable("RATE_LIMIT_UNAVAILABLE", limit, windowMs, Date.now())
  }

  return new DistributedAiRateLimiter(adapter).consume(input)
}

/**
 * Legacy process-local limiter retained for source compatibility until the AI
 * routes are separately migrated to await consumeDistributedAiRateLimit.
 */
export function consumeAiRateLimit(subject: string) {
  const now = Date.now()
  const windowMs = 60_000
  const limit = configuredLimit()

  cleanupExpired(now)

  const current = store.get(subject)
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current

  bucket.count += 1
  store.set(subject, bucket)

  return {
    allowed: bucket.count <= limit,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    distributed: false,
  }
}
