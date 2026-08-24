import { Redis } from "@upstash/redis"

import { isStableCustomerSubject } from "@/lib/auth"
import { creditBalanceKeys } from "@/lib/server/credit-ledger"

export const OWNER_QA_DAILY_CREDITS = 3
const OWNER_QA_CLAIM_TTL_SECONDS = 60 * 60 * 48

let redisClient: Redis | null | undefined

function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient

  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)?.trim()

  redisClient = url && token ? new Redis({ url, token }) : null
  return redisClient
}

function requireStableSubject(subject: string): string {
  const candidate = subject.trim()
  if (!isStableCustomerSubject(candidate)) {
    throw new Error("STABLE_CUSTOMER_SUBJECT_REQUIRED")
  }
  return candidate
}

export function ownerQaUtcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export function ownerQaClaimKey(subject: string, now = new Date()): string {
  const owner = requireStableSubject(subject)
  return `ams:owner-qa-entitlement:content:${ownerQaUtcDay(now)}:${owner}`
}

export type OwnerQaCreditGrantResult = {
  state: "granted" | "already-granted"
  balance: number
  dailyAllowance: number
  utcDay: string
}

export async function grantOwnerDailyQaCredits(
  subject: string,
  now = new Date(),
): Promise<OwnerQaCreditGrantResult> {
  const redis = getRedis()
  const owner = requireStableSubject(subject)
  if (!redis) throw new Error("ENTITLEMENT_STORE_NOT_CONFIGURED")

  const creditKeys = creditBalanceKeys(owner)
  const agentsKey = `ams:entitlements:agents:${owner}`
  const claimKey = ownerQaClaimKey(owner, now)
  const utcDay = ownerQaUtcDay(now)

  const script = `
    if redis.call('EXISTS', KEYS[1]) == 1 then
      return {'already-granted', redis.call('GET', KEYS[3]) or '0'}
    end

    redis.call('SADD', KEYS[2], 'content')
    local credits = redis.call('INCRBY', KEYS[3], ARGV[1])
    redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
    return {'granted', tostring(credits)}
  `

  const raw = await redis.eval(
    script,
    [claimKey, agentsKey, creditKeys.topup],
    [String(OWNER_QA_DAILY_CREDITS), now.toISOString(), String(OWNER_QA_CLAIM_TTL_SECONDS)],
  )

  if (!Array.isArray(raw) || (raw[0] !== "granted" && raw[0] !== "already-granted")) {
    throw new Error("OWNER_QA_CREDIT_GRANT_INVALID_RESPONSE")
  }

  const parsedBalance = Number.parseInt(String(raw[1] ?? "0"), 10)
  const balance = Number.isFinite(parsedBalance) && parsedBalance > 0 ? parsedBalance : 0

  return {
    state: raw[0] === "granted" ? "granted" : "already-granted",
    balance,
    dailyAllowance: OWNER_QA_DAILY_CREDITS,
    utcDay,
  }
}
