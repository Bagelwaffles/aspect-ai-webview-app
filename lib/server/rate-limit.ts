type RateLimitBucket = {
  count: number
  resetAt: number
}

type RateLimitStore = Map<string, RateLimitBucket>

type GlobalWithRateLimits = typeof globalThis & {
  __amsRateLimits?: RateLimitStore
}

const globalStore = globalThis as GlobalWithRateLimits
const store = globalStore.__amsRateLimits ?? new Map<string, RateLimitBucket>()
globalStore.__amsRateLimits = store

function clampLimit(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(60, Math.max(1, parsed))
}

function cleanupExpired(now: number) {
  if (store.size < 2000) return

  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key)
  }
}

export function consumeAiRateLimit(subject: string) {
  const now = Date.now()
  const windowMs = 60_000
  const limit = clampLimit(process.env.AMS_AI_REQUESTS_PER_MINUTE, 10)

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
