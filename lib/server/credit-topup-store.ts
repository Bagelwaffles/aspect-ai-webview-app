import { createHash } from "node:crypto"

import { Redis } from "@upstash/redis"

import { isStableCustomerSubject } from "../auth"
import { creditTopupPackFromUnits } from "../credit-topups"
import { creditBalanceKeys } from "./credit-ledger"

export type CreditTopupGrantInput = {
  subject: string
  units: number
  checkoutSessionId: string
  stripePriceId: string
  stripeEventId: string
}

export type CreditTopupGrantResult = {
  applied: boolean
  idempotent: boolean
  topupCredits: number
}

let redisClient: Redis | null | undefined

function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient

  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)?.trim()
  redisClient = url && token ? new Redis({ url, token }) : null
  return redisClient
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function requireSubject(subject: string): string {
  const candidate = subject.trim()
  if (!isStableCustomerSubject(candidate)) throw new Error("STABLE_CUSTOMER_SUBJECT_REQUIRED")
  return candidate
}

function requireIdentifier(value: string, code: string): string {
  const candidate = value.trim()
  if (!candidate) throw new Error(code)
  return candidate
}

export function isCreditTopupStoreConfigured(): boolean {
  return Boolean(getRedis())
}

export async function grantCreditTopupOnce(
  input: CreditTopupGrantInput,
): Promise<CreditTopupGrantResult> {
  const redis = getRedis()
  if (!redis) throw new Error("CREDIT_TOPUP_STORE_NOT_CONFIGURED")

  const subject = requireSubject(input.subject)
  const pack = creditTopupPackFromUnits(input.units)
  if (!pack) throw new Error("CREDIT_TOPUP_UNITS_INVALID")

  const checkoutSessionId = requireIdentifier(
    input.checkoutSessionId,
    "CREDIT_TOPUP_CHECKOUT_SESSION_REQUIRED",
  )
  const stripePriceId = requireIdentifier(input.stripePriceId, "CREDIT_TOPUP_PRICE_REQUIRED")
  const stripeEventId = requireIdentifier(input.stripeEventId, "CREDIT_TOPUP_EVENT_REQUIRED")

  const subjectHash = hash(subject)
  const sessionHash = hash(checkoutSessionId)
  const bindingHash = hash(`${subject}\u0000${checkoutSessionId}\u0000${stripePriceId}\u0000${pack.units}`)
  const balanceKey = creditBalanceKeys(subject).topup
  const purchaseKey = `ams:credits:topup-purchase:${sessionHash}`
  const ledgerKey = `ams:credits:ledger:${subjectHash}`
  const timestamp = new Date().toISOString()

  const script = `
    local existingBinding = redis.call('HGET', KEYS[2], 'bindingHash')
    local currentBalance = tonumber(redis.call('GET', KEYS[1]) or '0')
    if currentBalance < 0 then
      return {'corrupt', tostring(currentBalance)}
    end

    if existingBinding then
      if existingBinding ~= ARGV[1] then
        return {'conflict', tostring(currentBalance)}
      end
      return {'existing', tostring(currentBalance)}
    end

    local newBalance = redis.call('INCRBY', KEYS[1], ARGV[2])
    redis.call(
      'HSET', KEYS[2],
      'bindingHash', ARGV[1],
      'subjectHash', ARGV[3],
      'sessionHash', ARGV[4],
      'stripePriceId', ARGV[5],
      'stripeEventId', ARGV[6],
      'units', ARGV[2],
      'grantedAt', ARGV[7]
    )
    redis.call(
      'XADD', KEYS[3], 'MAXLEN', '~', 1000, '*',
      'action', 'topup_granted',
      'sessionHash', ARGV[4],
      'stripePriceId', ARGV[5],
      'stripeEventId', ARGV[6],
      'amount', ARGV[2],
      'availableTopup', tostring(newBalance),
      'at', ARGV[7]
    )
    return {'granted', tostring(newBalance)}
  `

  const raw = await redis.eval(
    script,
    [balanceKey, purchaseKey, ledgerKey],
    [
      bindingHash,
      pack.units,
      subjectHash,
      sessionHash,
      stripePriceId,
      stripeEventId,
      timestamp,
    ],
  )

  if (!Array.isArray(raw) || typeof raw[0] !== "string") {
    throw new Error("CREDIT_TOPUP_STORE_INVALID_RESPONSE")
  }

  const balance = Number.parseInt(String(raw[1] ?? ""), 10)
  if (!Number.isSafeInteger(balance) || balance < 0) {
    throw new Error("CREDIT_TOPUP_STORE_INVALID_BALANCE")
  }

  if (raw[0] === "granted") {
    return { applied: true, idempotent: false, topupCredits: balance }
  }
  if (raw[0] === "existing") {
    return { applied: false, idempotent: true, topupCredits: balance }
  }
  if (raw[0] === "conflict") throw new Error("CREDIT_TOPUP_PURCHASE_CONFLICT")
  if (raw[0] === "corrupt") throw new Error("CREDIT_TOPUP_BALANCE_CORRUPT")

  throw new Error("CREDIT_TOPUP_STORE_INVALID_RESPONSE")
}
