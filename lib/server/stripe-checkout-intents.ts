import { createHash, randomUUID } from "node:crypto"

import { Redis } from "@upstash/redis"

import { isStableCustomerSubject } from "../auth"
import type { PlanSlug } from "./entitlements"

const CHECKOUT_INTENT_SECONDS = 60 * 60
const CHECKOUT_INTENT_GRACE_SECONDS = 5 * 60
const CHECKOUT_LEASE_SECONDS = 2 * 60

export type StripeCheckoutIntentClaim =
  | { state: "claimed"; token: string; idempotencyKey: string; expiresAt: number }
  | { state: "open"; sessionId: string; url: string; expiresAt: number }
  | { state: "processing"; retryAfterSeconds: number }
  | { state: "active_subscription" }
  | { state: "conflict" }

const CLAIM_CHECKOUT_INTENT_SCRIPT = `
  local subscriptionStatus = redis.call('HGET', KEYS[2], 'subscriptionStatus') or 'inactive'
  if subscriptionStatus == 'active' or subscriptionStatus == 'trialing' then
    return {'active_subscription'}
  end

  local state = redis.call('HGET', KEYS[1], 'state') or ''
  local existingBinding = redis.call('HGET', KEYS[1], 'bindingHash') or ''
  local existingIdempotencyKey = redis.call('HGET', KEYS[1], 'idempotencyKey') or ''
  local leaseExpiresAt = tonumber(redis.call('HGET', KEYS[1], 'leaseExpiresAt') or '0')
  local intentExpiresAt = tonumber(redis.call('HGET', KEYS[1], 'expiresAt') or '0')
  local now = tonumber(ARGV[6])

  if state == 'open' and intentExpiresAt > now then
    if existingBinding ~= ARGV[1] then
      return {'conflict'}
    end
    return {
      'open',
      redis.call('HGET', KEYS[1], 'sessionId') or '',
      redis.call('HGET', KEYS[1], 'url') or '',
      tostring(intentExpiresAt)
    }
  end

  if state == 'processing' and leaseExpiresAt > now then
    if existingBinding ~= ARGV[1] then
      return {'conflict'}
    end
    return {'processing', tostring(math.max(1, math.ceil((leaseExpiresAt - now) / 1000)))}
  end

  if state ~= '' and intentExpiresAt > now and existingBinding ~= ARGV[1] then
    return {'conflict'}
  end

  local idempotencyKey = ARGV[5]
  if state ~= 'open' and existingBinding == ARGV[1] and existingIdempotencyKey ~= '' and intentExpiresAt > now then
    idempotencyKey = existingIdempotencyKey
  end

  redis.call(
    'HSET', KEYS[1],
    'state', 'processing',
    'bindingHash', ARGV[1],
    'plan', ARGV[2],
    'priceId', ARGV[3],
    'token', ARGV[4],
    'idempotencyKey', idempotencyKey,
    'leaseExpiresAt', ARGV[7],
    'expiresAt', ARGV[8],
    'updatedAt', ARGV[6]
  )
  redis.call('HDEL', KEYS[1], 'sessionId', 'url')
  redis.call('EXPIRE', KEYS[1], ARGV[9])
  return {'claimed', ARGV[4], idempotencyKey, ARGV[8]}
`

const COMPLETE_CHECKOUT_INTENT_SCRIPT = `
  local state = redis.call('HGET', KEYS[1], 'state') or ''
  local token = redis.call('HGET', KEYS[1], 'token') or ''
  if state ~= 'processing' or token ~= ARGV[1] then
    return {'ownership_lost'}
  end

  redis.call(
    'HSET', KEYS[1],
    'state', 'open',
    'sessionId', ARGV[2],
    'url', ARGV[3],
    'expiresAt', ARGV[4],
    'updatedAt', ARGV[5]
  )
  redis.call('HDEL', KEYS[1], 'token', 'leaseExpiresAt')
  redis.call('EXPIRE', KEYS[1], ARGV[6])
  return {'completed'}
`

const RELEASE_CHECKOUT_INTENT_SCRIPT = `
  local state = redis.call('HGET', KEYS[1], 'state') or ''
  local token = redis.call('HGET', KEYS[1], 'token') or ''
  if state ~= 'processing' or token ~= ARGV[1] then
    return {'ownership_lost'}
  end

  redis.call('HSET', KEYS[1], 'state', 'retryable', 'leaseExpiresAt', '0', 'updatedAt', ARGV[2])
  redis.call('HDEL', KEYS[1], 'token')
  redis.call('EXPIRE', KEYS[1], ARGV[3])
  return {'released'}
`

let redisClient: Redis | null | undefined

function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient

  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)?.trim()
  redisClient = url && token ? new Redis({ url, token }) : null
  return redisClient
}

function requireSubject(subject: string): string {
  const candidate = subject.trim()
  if (!isStableCustomerSubject(candidate)) throw new Error("STABLE_CUSTOMER_SUBJECT_REQUIRED")
  return candidate
}

function intentKey(subject: string): string {
  const subjectHash = createHash("sha256").update(subject).digest("hex")
  return `ams:stripe:checkout-intent:${subjectHash}`
}

function profileKey(subject: string): string {
  return `ams:entitlements:profile:${subject}`
}

function bindingHash(plan: PlanSlug, priceId: string): string {
  return createHash("sha256").update(`${plan}\u0000${priceId}`).digest("hex")
}

function newIdempotencyKey(subject: string, plan: PlanSlug, priceId: string): string {
  const digest = createHash("sha256")
    .update(`${subject}\u0000${plan}\u0000${priceId}\u0000${randomUUID()}`)
    .digest("hex")
  return `ams-checkout-${digest}`
}

function positiveInteger(value: unknown): number | null {
  const parsed = Number.parseInt(String(value), 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export function isStripeCheckoutIntentStoreConfigured(): boolean {
  return Boolean(getRedis())
}

export async function claimStripeCheckoutIntent(input: {
  subject: string
  plan: PlanSlug
  priceId: string
  now?: number
}): Promise<StripeCheckoutIntentClaim> {
  const redis = getRedis()
  const subject = requireSubject(input.subject)
  const priceId = input.priceId.trim()
  if (!redis || !priceId) throw new Error("CHECKOUT_INTENT_STORE_NOT_CONFIGURED")

  const now = input.now ?? Date.now()
  const leaseExpiresAt = now + CHECKOUT_LEASE_SECONDS * 1000
  const expiresAt = now + CHECKOUT_INTENT_SECONDS * 1000
  const ttlSeconds = CHECKOUT_INTENT_SECONDS + CHECKOUT_INTENT_GRACE_SECONDS
  const raw = await redis.eval(
    CLAIM_CHECKOUT_INTENT_SCRIPT,
    [intentKey(subject), profileKey(subject)],
    [
      bindingHash(input.plan, priceId),
      input.plan,
      priceId,
      randomUUID(),
      newIdempotencyKey(subject, input.plan, priceId),
      now,
      leaseExpiresAt,
      expiresAt,
      ttlSeconds,
    ],
  )

  if (!Array.isArray(raw) || typeof raw[0] !== "string") {
    throw new Error("CHECKOUT_INTENT_INVALID_RESPONSE")
  }

  if (raw[0] === "active_subscription") return { state: "active_subscription" }
  if (raw[0] === "conflict") return { state: "conflict" }
  if (raw[0] === "processing") {
    return { state: "processing", retryAfterSeconds: positiveInteger(raw[1]) ?? 1 }
  }
  if (raw[0] === "open") {
    const sessionId = typeof raw[1] === "string" ? raw[1] : ""
    const url = typeof raw[2] === "string" ? raw[2] : ""
    const storedExpiresAt = positiveInteger(raw[3])
    if (!sessionId || !url || !storedExpiresAt) throw new Error("CHECKOUT_INTENT_INVALID_RESPONSE")
    return { state: "open", sessionId, url, expiresAt: storedExpiresAt }
  }
  if (raw[0] === "claimed") {
    const token = typeof raw[1] === "string" ? raw[1] : ""
    const idempotencyKey = typeof raw[2] === "string" ? raw[2] : ""
    const storedExpiresAt = positiveInteger(raw[3])
    if (!token || !idempotencyKey || !storedExpiresAt) {
      throw new Error("CHECKOUT_INTENT_INVALID_RESPONSE")
    }
    return { state: "claimed", token, idempotencyKey, expiresAt: storedExpiresAt }
  }

  throw new Error("CHECKOUT_INTENT_INVALID_RESPONSE")
}

export async function completeStripeCheckoutIntent(input: {
  subject: string
  token: string
  sessionId: string
  url: string
  expiresAt: number
  now?: number
}): Promise<void> {
  const redis = getRedis()
  const subject = requireSubject(input.subject)
  const now = input.now ?? Date.now()
  const ttlSeconds = Math.max(
    CHECKOUT_INTENT_GRACE_SECONDS,
    Math.ceil((input.expiresAt - now) / 1000) + CHECKOUT_INTENT_GRACE_SECONDS,
  )
  if (!redis || !input.token.trim() || !input.sessionId.trim() || !input.url.trim()) {
    throw new Error("CHECKOUT_INTENT_STORE_NOT_CONFIGURED")
  }

  const raw = await redis.eval(
    COMPLETE_CHECKOUT_INTENT_SCRIPT,
    [intentKey(subject)],
    [input.token.trim(), input.sessionId.trim(), input.url.trim(), input.expiresAt, now, ttlSeconds],
  )
  if (!Array.isArray(raw) || raw[0] !== "completed") {
    throw new Error("CHECKOUT_INTENT_OWNERSHIP_LOST")
  }
}

export async function releaseStripeCheckoutIntent(input: {
  subject: string
  token: string
  now?: number
}): Promise<void> {
  const redis = getRedis()
  const subject = requireSubject(input.subject)
  const now = input.now ?? Date.now()
  if (!redis || !input.token.trim()) throw new Error("CHECKOUT_INTENT_STORE_NOT_CONFIGURED")

  const raw = await redis.eval(
    RELEASE_CHECKOUT_INTENT_SCRIPT,
    [intentKey(subject)],
    [input.token.trim(), now, CHECKOUT_INTENT_SECONDS + CHECKOUT_INTENT_GRACE_SECONDS],
  )
  if (!Array.isArray(raw) || raw[0] !== "released") {
    throw new Error("CHECKOUT_INTENT_OWNERSHIP_LOST")
  }
}
