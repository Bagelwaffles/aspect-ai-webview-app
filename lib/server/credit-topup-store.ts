import { createHash } from "node:crypto"

import { Redis } from "@upstash/redis"

import { isStableCustomerSubject } from "../auth"
import { creditTopupPackFromUnits } from "../credit-topups"
import { creditBalanceKeys } from "./credit-ledger"

export type CreditTopupGrantInput = {
  subject: string
  units: number
  checkoutSessionId: string
  paymentIntentId: string
  stripePriceId: string
  stripeEventId: string
}

export type CreditTopupGrantResult = {
  applied: boolean
  idempotent: boolean
  topupCredits: number
}

export type CreditTopupReversalSource = "refund" | "dispute"

export type CreditTopupReversalInput = {
  subject: string
  units: number
  paymentIntentId: string
  stripeEventId: string
  source: CreditTopupReversalSource
  targetUnits: number
}

export type CreditTopupReversalResult = {
  found: boolean
  applied: boolean
  idempotent: boolean
  topupCredits: number
  planCredits: number
  targetUnits: number
  withheldUnits: number
  unrecoveredUnits: number
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

function requireTargetUnits(targetUnits: number, purchaseUnits: number): number {
  const target = Math.floor(targetUnits)
  if (!Number.isSafeInteger(target) || target < 0 || target > purchaseUnits) {
    throw new Error("CREDIT_TOPUP_REVERSAL_TARGET_INVALID")
  }
  return target
}

function purchaseKeys(subject: string, checkoutSessionId: string, paymentIntentId: string) {
  const subjectHash = hash(subject)
  const sessionHash = hash(checkoutSessionId)
  const paymentIntentHash = hash(paymentIntentId)
  return {
    subjectHash,
    sessionHash,
    paymentIntentHash,
    sessionPurchase: `ams:credits:topup-purchase:${sessionHash}`,
    paymentPurchase: `ams:credits:topup-payment:${paymentIntentHash}`,
    ledger: `ams:credits:ledger:${subjectHash}`,
  }
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
  const paymentIntentId = requireIdentifier(
    input.paymentIntentId,
    "CREDIT_TOPUP_PAYMENT_INTENT_REQUIRED",
  )
  const stripePriceId = requireIdentifier(input.stripePriceId, "CREDIT_TOPUP_PRICE_REQUIRED")
  const stripeEventId = requireIdentifier(input.stripeEventId, "CREDIT_TOPUP_EVENT_REQUIRED")

  const key = purchaseKeys(subject, checkoutSessionId, paymentIntentId)
  // Preserve the original session binding format so any pre-guardrail purchase can be
  // safely replayed and enriched with its PaymentIntent mapping without another grant.
  const sessionBindingHash = hash(
    `${subject}\u0000${checkoutSessionId}\u0000${stripePriceId}\u0000${pack.units}`,
  )
  const paymentBindingHash = hash(`${subject}\u0000${paymentIntentId}\u0000${pack.units}`)
  const balanceKey = creditBalanceKeys(subject).topup
  const timestamp = new Date().toISOString()

  const script = `
    local sessionBinding = redis.call('HGET', KEYS[2], 'bindingHash')
    local paymentBinding = redis.call('HGET', KEYS[3], 'bindingHash')
    local currentBalance = tonumber(redis.call('GET', KEYS[1]) or '0')
    if currentBalance < 0 then
      return {'corrupt', tostring(currentBalance)}
    end

    if sessionBinding and sessionBinding ~= ARGV[1] then
      return {'conflict', tostring(currentBalance)}
    end
    if paymentBinding and paymentBinding ~= ARGV[2] then
      return {'conflict', tostring(currentBalance)}
    end

    if sessionBinding then
      if not paymentBinding then
        redis.call(
          'HSET', KEYS[3],
          'bindingHash', ARGV[2],
          'subjectHash', ARGV[3],
          'sessionHash', ARGV[4],
          'paymentIntentHash', ARGV[5],
          'paymentIntentId', ARGV[6],
          'stripePriceId', ARGV[7],
          'units', ARGV[8],
          'refundTargetUnits', '0',
          'disputeTargetUnits', '0',
          'withheldUnits', '0',
          'unrecoveredUnits', '0',
          'grantedAt', ARGV[10]
        )
        redis.call('HSET', KEYS[2], 'paymentIntentId', ARGV[6], 'paymentIntentHash', ARGV[5])
      end
      return {'existing', tostring(currentBalance)}
    end

    if paymentBinding then
      return {'conflict', tostring(currentBalance)}
    end

    local newBalance = redis.call('INCRBY', KEYS[1], ARGV[8])
    redis.call(
      'HSET', KEYS[2],
      'bindingHash', ARGV[1],
      'subjectHash', ARGV[3],
      'sessionHash', ARGV[4],
      'paymentIntentHash', ARGV[5],
      'paymentIntentId', ARGV[6],
      'stripePriceId', ARGV[7],
      'stripeEventId', ARGV[9],
      'units', ARGV[8],
      'grantedAt', ARGV[10]
    )
    redis.call(
      'HSET', KEYS[3],
      'bindingHash', ARGV[2],
      'subjectHash', ARGV[3],
      'sessionHash', ARGV[4],
      'paymentIntentHash', ARGV[5],
      'paymentIntentId', ARGV[6],
      'stripePriceId', ARGV[7],
      'stripeEventId', ARGV[9],
      'units', ARGV[8],
      'refundTargetUnits', '0',
      'disputeTargetUnits', '0',
      'withheldUnits', '0',
      'unrecoveredUnits', '0',
      'grantedAt', ARGV[10]
    )
    redis.call(
      'XADD', KEYS[4], 'MAXLEN', '~', 1000, '*',
      'action', 'topup_granted',
      'sessionHash', ARGV[4],
      'paymentIntentHash', ARGV[5],
      'stripePriceId', ARGV[7],
      'stripeEventId', ARGV[9],
      'amount', ARGV[8],
      'availableTopup', tostring(newBalance),
      'at', ARGV[10]
    )
    return {'granted', tostring(newBalance)}
  `

  const raw = await redis.eval(
    script,
    [balanceKey, key.sessionPurchase, key.paymentPurchase, key.ledger],
    [
      sessionBindingHash,
      paymentBindingHash,
      key.subjectHash,
      key.sessionHash,
      key.paymentIntentHash,
      paymentIntentId,
      stripePriceId,
      pack.units,
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

export async function reconcileCreditTopupReversal(
  input: CreditTopupReversalInput,
): Promise<CreditTopupReversalResult> {
  const redis = getRedis()
  if (!redis) throw new Error("CREDIT_TOPUP_STORE_NOT_CONFIGURED")

  const subject = requireSubject(input.subject)
  const pack = creditTopupPackFromUnits(input.units)
  if (!pack) throw new Error("CREDIT_TOPUP_UNITS_INVALID")
  const paymentIntentId = requireIdentifier(
    input.paymentIntentId,
    "CREDIT_TOPUP_PAYMENT_INTENT_REQUIRED",
  )
  const stripeEventId = requireIdentifier(input.stripeEventId, "CREDIT_TOPUP_EVENT_REQUIRED")
  const targetUnits = requireTargetUnits(input.targetUnits, pack.units)
  if (input.source !== "refund" && input.source !== "dispute") {
    throw new Error("CREDIT_TOPUP_REVERSAL_SOURCE_INVALID")
  }

  const subjectHash = hash(subject)
  const paymentIntentHash = hash(paymentIntentId)
  const paymentPurchaseKey = `ams:credits:topup-payment:${paymentIntentHash}`
  const paymentBindingHash = hash(`${subject}\u0000${paymentIntentId}\u0000${pack.units}`)
  const creditKeys = creditBalanceKeys(subject)
  const ledgerKey = `ams:credits:ledger:${subjectHash}`
  const timestamp = new Date().toISOString()

  const script = `
    local binding = redis.call('HGET', KEYS[3], 'bindingHash')
    local topup = tonumber(redis.call('GET', KEYS[1]) or '0')
    local plan = tonumber(redis.call('GET', KEYS[2]) or '0')
    if topup < 0 or plan < 0 then
      return {'corrupt', tostring(topup), tostring(plan)}
    end
    if not binding then
      return {'not_found', tostring(topup), tostring(plan), '0', '0', '0'}
    end
    if binding ~= ARGV[1] then
      return {'conflict', tostring(topup), tostring(plan), '0', '0', '0'}
    end

    local storedUnits = tonumber(redis.call('HGET', KEYS[3], 'units') or '0')
    if storedUnits ~= tonumber(ARGV[2]) then
      return {'conflict', tostring(topup), tostring(plan), '0', '0', '0'}
    end

    local refundTarget = tonumber(redis.call('HGET', KEYS[3], 'refundTargetUnits') or '0')
    local disputeTarget = tonumber(redis.call('HGET', KEYS[3], 'disputeTargetUnits') or '0')
    local oldWithheld = tonumber(redis.call('HGET', KEYS[3], 'withheldUnits') or '0')
    if refundTarget < 0 or disputeTarget < 0 or oldWithheld < 0 then
      return {'corrupt', tostring(topup), tostring(plan), '0', '0', '0'}
    end

    local requestedTarget = tonumber(ARGV[4])
    if ARGV[3] == 'refund' then
      if requestedTarget > refundTarget then refundTarget = requestedTarget end
    else
      disputeTarget = requestedTarget
    end

    local target = math.max(refundTarget, disputeTarget)
    local withheld = oldWithheld
    local topupBefore = topup
    local planBefore = plan

    if withheld < target then
      local needed = target - withheld
      local fromTopup = math.min(topup, needed)
      topup = topup - fromTopup
      needed = needed - fromTopup
      local fromPlan = math.min(plan, needed)
      plan = plan - fromPlan
      withheld = withheld + fromTopup + fromPlan
    elseif withheld > target then
      local restore = withheld - target
      topup = topup + restore
      withheld = target
    end

    local unrecovered = target - withheld
    redis.call('SET', KEYS[1], topup)
    redis.call('SET', KEYS[2], plan)
    redis.call(
      'HSET', KEYS[3],
      'refundTargetUnits', tostring(refundTarget),
      'disputeTargetUnits', tostring(disputeTarget),
      'withheldUnits', tostring(withheld),
      'unrecoveredUnits', tostring(unrecovered),
      'lastReversalEventId', ARGV[5],
      'lastReversalAt', ARGV[6]
    )

    local changed = (topup ~= topupBefore) or (plan ~= planBefore) or (withheld ~= oldWithheld)
    redis.call(
      'XADD', KEYS[4], 'MAXLEN', '~', 1000, '*',
      'action', 'topup_reconciled',
      'paymentIntentHash', ARGV[7],
      'source', ARGV[3],
      'targetUnits', tostring(target),
      'withheldUnits', tostring(withheld),
      'unrecoveredUnits', tostring(unrecovered),
      'stripeEventId', ARGV[5],
      'availableTopup', tostring(topup),
      'availablePlan', tostring(plan),
      'at', ARGV[6]
    )
    if changed then
      return {'applied', tostring(topup), tostring(plan), tostring(target), tostring(withheld), tostring(unrecovered)}
    end
    return {'existing', tostring(topup), tostring(plan), tostring(target), tostring(withheld), tostring(unrecovered)}
  `

  const raw = await redis.eval(
    script,
    [creditKeys.topup, creditKeys.plan, paymentPurchaseKey, ledgerKey],
    [
      paymentBindingHash,
      pack.units,
      input.source,
      targetUnits,
      stripeEventId,
      timestamp,
      paymentIntentHash,
    ],
  )

  if (!Array.isArray(raw) || typeof raw[0] !== "string") {
    throw new Error("CREDIT_TOPUP_STORE_INVALID_RESPONSE")
  }

  const parse = (value: unknown, code: string) => {
    const parsed = Number.parseInt(String(value ?? ""), 10)
    if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(code)
    return parsed
  }
  const topupCredits = parse(raw[1], "CREDIT_TOPUP_STORE_INVALID_BALANCE")
  const planCredits = parse(raw[2], "CREDIT_TOPUP_STORE_INVALID_BALANCE")
  const reconciledTarget = parse(raw[3], "CREDIT_TOPUP_STORE_INVALID_RESPONSE")
  const withheldUnits = parse(raw[4], "CREDIT_TOPUP_STORE_INVALID_RESPONSE")
  const unrecoveredUnits = parse(raw[5], "CREDIT_TOPUP_STORE_INVALID_RESPONSE")

  if (raw[0] === "not_found") {
    return {
      found: false,
      applied: false,
      idempotent: true,
      topupCredits,
      planCredits,
      targetUnits: 0,
      withheldUnits: 0,
      unrecoveredUnits: 0,
    }
  }
  if (raw[0] === "applied" || raw[0] === "existing") {
    return {
      found: true,
      applied: raw[0] === "applied",
      idempotent: raw[0] === "existing",
      topupCredits,
      planCredits,
      targetUnits: reconciledTarget,
      withheldUnits,
      unrecoveredUnits,
    }
  }
  if (raw[0] === "conflict") throw new Error("CREDIT_TOPUP_PURCHASE_CONFLICT")
  if (raw[0] === "corrupt") throw new Error("CREDIT_TOPUP_BALANCE_CORRUPT")

  throw new Error("CREDIT_TOPUP_STORE_INVALID_RESPONSE")
}
