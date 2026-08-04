import { randomUUID } from "node:crypto"

import { Redis } from "@upstash/redis"

import { isStableCustomerSubject } from "../auth"
import {
  createUpstashCreditLedger,
  creditBalanceKeys,
  type CreditFinalizationResult,
  type CreditReservationResult,
} from "./credit-ledger"
import {
  UpstashStripeEntitlementWriter,
  type StripeEntitlementApplyResult,
  type StripeEntitlementMutation,
  type StripeSubscriptionRevocation,
} from "./stripe-entitlements"

export type PlanSlug = "starter" | "growth" | "pro"
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "inactive"

export type EntitlementSnapshot = {
  configured: boolean
  subject: string
  billingEmail: string | null
  plan: PlanSlug | null
  subscriptionStatus: SubscriptionStatus
  planCredits: number
  topupCredits: number
  totalCredits: number
  agentSlugs: string[]
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
}

const PLAN_CREDITS: Record<PlanSlug, number> = {
  starter: 2000,
  growth: 8000,
  pro: 20000,
}

const CORE_AGENT_SLUGS = new Set(["content", "outreach", "analytics"])

let redisClient: Redis | null | undefined

function normalizeBillingEmail(value: unknown): string | null {
  if (typeof value !== "string") return null
  const email = value.trim().toLowerCase()
  return email.includes("@") ? email : null
}

function requireStableSubject(subject: string): string {
  const candidate = subject.trim()
  if (!isStableCustomerSubject(candidate)) {
    throw new Error("STABLE_CUSTOMER_SUBJECT_REQUIRED")
  }
  return candidate
}

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase().replace(/_/g, "-")
}

function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient

  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)?.trim()

  redisClient = url && token ? new Redis({ url, token }) : null
  return redisClient
}

function keys(subject: string) {
  const owner = requireStableSubject(subject)
  const creditKeys = creditBalanceKeys(owner)
  return {
    profile: `ams:entitlements:profile:${owner}`,
    agents: `ams:entitlements:agents:${owner}`,
    planCredits: creditKeys.plan,
    topupCredits: creditKeys.topup,
  }
}

function parseNonNegativeInt(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? "0"), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function isPlanSlug(value: unknown): value is PlanSlug {
  return value === "starter" || value === "growth" || value === "pro"
}

function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return ["trialing", "active", "past_due", "canceled", "inactive"].includes(String(value))
}

export function isEntitlementStoreConfigured(): boolean {
  return Boolean(getRedis())
}

export function monthlyCreditsForPlan(plan: PlanSlug): number {
  return PLAN_CREDITS[plan]
}

export async function getEntitlementSnapshot(subject: string): Promise<EntitlementSnapshot> {
  const owner = requireStableSubject(subject)
  const redis = getRedis()

  if (!redis) {
    return {
      configured: false,
      subject: owner,
      billingEmail: null,
      plan: null,
      subscriptionStatus: "inactive",
      planCredits: 0,
      topupCredits: 0,
      totalCredits: 0,
      agentSlugs: [],
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    }
  }

  const key = keys(owner)
  const [profile, agentSlugs, planCreditsRaw, topupCreditsRaw] = await Promise.all([
    redis.hgetall<Record<string, string>>(key.profile),
    redis.smembers<string[]>(key.agents),
    redis.get<number | string>(key.planCredits),
    redis.get<number | string>(key.topupCredits),
  ])

  const plan = isPlanSlug(profile?.plan) ? profile.plan : null
  const subscriptionStatus = isSubscriptionStatus(profile?.subscriptionStatus)
    ? profile.subscriptionStatus
    : "inactive"
  const planCredits = parseNonNegativeInt(planCreditsRaw)
  const topupCredits = parseNonNegativeInt(topupCreditsRaw)

  return {
    configured: true,
    subject: owner,
    billingEmail: normalizeBillingEmail(profile?.billingEmail),
    plan,
    subscriptionStatus,
    planCredits,
    topupCredits,
    totalCredits: planCredits + topupCredits,
    agentSlugs: Array.isArray(agentSlugs) ? agentSlugs.map(normalizeSlug).sort() : [],
    stripeCustomerId: profile?.stripeCustomerId || null,
    stripeSubscriptionId: profile?.stripeSubscriptionId || null,
  }
}

export async function setPlanEntitlement(input: {
  subject: string
  billingEmail?: string | null
  plan: PlanSlug
  subscriptionStatus: SubscriptionStatus
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  resetPlanCredits?: boolean
}) {
  const redis = getRedis()
  const subject = requireStableSubject(input.subject)
  const billingEmail = normalizeBillingEmail(input.billingEmail)
  if (!redis) throw new Error("ENTITLEMENT_STORE_NOT_CONFIGURED")

  const key = keys(subject)
  const profile: Record<string, string> = {
    subject,
    plan: input.plan,
    subscriptionStatus: input.subscriptionStatus,
    stripeCustomerId: input.stripeCustomerId ?? "",
    stripeSubscriptionId: input.stripeSubscriptionId ?? "",
    updatedAt: new Date().toISOString(),
  }
  if (billingEmail) profile.billingEmail = billingEmail
  await redis.hset(key.profile, profile)

  if (input.resetPlanCredits) {
    await redis.set(key.planCredits, monthlyCreditsForPlan(input.plan))
  }
}

export async function setSubscriptionStatus(subject: string, status: SubscriptionStatus) {
  const redis = getRedis()
  const owner = requireStableSubject(subject)
  if (!redis) throw new Error("ENTITLEMENT_STORE_NOT_CONFIGURED")
  await redis.hset(keys(owner).profile, { subscriptionStatus: status, updatedAt: new Date().toISOString() })
}

export async function grantAgentEntitlement(subject: string, slug: string) {
  const redis = getRedis()
  const owner = requireStableSubject(subject)
  const agentSlug = normalizeSlug(slug)
  if (!redis || !agentSlug) throw new Error("ENTITLEMENT_STORE_NOT_CONFIGURED")
  await redis.sadd(keys(owner).agents, agentSlug)
}

export async function grantTopupCredits(subject: string, units: number) {
  const redis = getRedis()
  const owner = requireStableSubject(subject)
  const amount = Math.max(0, Math.floor(units))
  if (!redis || amount < 1) throw new Error("ENTITLEMENT_STORE_NOT_CONFIGURED")
  await redis.incrby(keys(owner).topupCredits, amount)
}

export function agentSlugForRuntimeAgent(agentId: string): string | null {
  const mapping: Record<string, string> = {
    "grok-content": "content",
    "grok-sales": "outreach",
    "grok-analytics": "analytics",
  }
  return mapping[agentId] ?? null
}

export function snapshotHasAgentAccess(snapshot: EntitlementSnapshot, agentSlug: string): boolean {
  const slug = normalizeSlug(agentSlug)
  const subscriptionActive = snapshot.subscriptionStatus === "active" || snapshot.subscriptionStatus === "trialing"
  if (subscriptionActive && snapshot.plan && CORE_AGENT_SLUGS.has(slug)) return true
  return snapshot.agentSlugs.includes(slug)
}

function getCreditLedger() {
  const redis = getRedis()
  if (!redis) throw new Error("ENTITLEMENT_STORE_NOT_CONFIGURED")
  return createUpstashCreditLedger(redis)
}

export async function reserveCredits(input: {
  subject: string
  units: number
  idempotencyKey: string
}): Promise<CreditReservationResult> {
  const owner = requireStableSubject(input.subject)
  return getCreditLedger().reserve({
    account: owner,
    amount: input.units,
    idempotencyKey: input.idempotencyKey,
  })
}

export async function commitCreditReservation(input: {
  subject: string
  idempotencyKey: string
}): Promise<CreditFinalizationResult> {
  const owner = requireStableSubject(input.subject)
  return getCreditLedger().commit({ account: owner, idempotencyKey: input.idempotencyKey })
}

export async function refundCreditReservation(input: {
  subject: string
  idempotencyKey: string
}): Promise<CreditFinalizationResult> {
  const owner = requireStableSubject(input.subject)
  return getCreditLedger().refund({ account: owner, idempotencyKey: input.idempotencyKey })
}

export async function consumeCredits(subject: string, units = 1, idempotencyKey?: string) {
  const owner = requireStableSubject(subject)
  const amount = Math.max(1, Math.floor(units))

  // Compatibility path for existing callers. New provider routes should reserve
  // before execution and explicitly commit or refund the same idempotency key.
  const operationKey = idempotencyKey?.trim() || `legacy-consume:${randomUUID()}`
  const ledger = getCreditLedger()
  const reservation = await ledger.reserve({
    account: owner,
    amount,
    idempotencyKey: operationKey,
  })

  if (!reservation.reserved || reservation.state === "refunded") {
    return {
      consumed: false,
      planCredits: reservation.planCredits,
      topupCredits: reservation.topupCredits,
    }
  }

  const result = await ledger.commit({ account: owner, idempotencyKey: operationKey })
  return {
    consumed: true,
    planCredits: result.planCredits,
    topupCredits: result.topupCredits,
  }
}

export type StripeEventClaim =
  | { state: "claimed"; token: string }
  | { state: "completed" }
  | { state: "processing" }

export async function applyStripeSubscriptionEntitlement(
  input: StripeEntitlementMutation,
): Promise<StripeEntitlementApplyResult> {
  const redis = getRedis()
  if (!redis) throw new Error("ENTITLEMENT_STORE_NOT_CONFIGURED")
  return new UpstashStripeEntitlementWriter(redis).apply(input)
}

export async function revokeStripeSubscriptionEntitlement(
  input: StripeSubscriptionRevocation,
): Promise<StripeEntitlementApplyResult> {
  const redis = getRedis()
  if (!redis) throw new Error("ENTITLEMENT_STORE_NOT_CONFIGURED")
  return new UpstashStripeEntitlementWriter(redis).revoke(input)
}

export async function claimStripeEvent(eventId: string): Promise<StripeEventClaim> {
  const redis = getRedis()
  const id = eventId.trim()
  if (!redis || !id) throw new Error("ENTITLEMENT_STORE_NOT_CONFIGURED")
  const token = randomUUID()
  const script = `
    local current = redis.call('GET', KEYS[1])
    if not current then
      redis.call('SET', KEYS[1], 'processing:' .. ARGV[1], 'EX', 600)
      return {'claimed'}
    end
    if current == 'done' then
      return {'completed'}
    end
    return {'processing'}
  `
  const raw = await redis.eval(script, [`ams:stripe:event:${id}`], [token])
  if (!Array.isArray(raw) || typeof raw[0] !== "string") {
    throw new Error("STRIPE_EVENT_CLAIM_INVALID_RESPONSE")
  }
  if (raw[0] === "claimed") return { state: "claimed", token }
  if (raw[0] === "completed" || raw[0] === "processing") return { state: raw[0] }
  throw new Error("STRIPE_EVENT_CLAIM_INVALID_RESPONSE")
}

export async function completeStripeEvent(eventId: string, token: string) {
  const redis = getRedis()
  const id = eventId.trim()
  const owner = token.trim()
  if (!redis || !id || !owner) throw new Error("ENTITLEMENT_STORE_NOT_CONFIGURED")
  const script = `
    local current = redis.call('GET', KEYS[1])
    if current == 'processing:' .. ARGV[1] then
      redis.call('SET', KEYS[1], 'done', 'EX', 7776000)
      return {'completed'}
    end
    if current == 'done' then
      return {'completed'}
    end
    return {'ownership_lost'}
  `
  const raw = await redis.eval(script, [`ams:stripe:event:${id}`], [owner])
  if (!Array.isArray(raw) || raw[0] !== "completed") {
    throw new Error("STRIPE_EVENT_CLAIM_OWNERSHIP_LOST")
  }
}

export async function releaseStripeEvent(eventId: string, token: string) {
  const redis = getRedis()
  const id = eventId.trim()
  const owner = token.trim()
  if (!redis || !id || !owner) throw new Error("ENTITLEMENT_STORE_NOT_CONFIGURED")
  const script = `
    local current = redis.call('GET', KEYS[1])
    if current == 'processing:' .. ARGV[1] then
      redis.call('DEL', KEYS[1])
      return 1
    end
    return 0
  `
  await redis.eval(script, [`ams:stripe:event:${id}`], [owner])
}
