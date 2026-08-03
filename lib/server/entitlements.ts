import { Redis } from "@upstash/redis"

export type PlanSlug = "starter" | "growth" | "pro"
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "inactive"

export type EntitlementSnapshot = {
  configured: boolean
  email: string
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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
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

function keys(email: string) {
  const user = normalizeEmail(email)
  return {
    profile: `ams:entitlements:profile:${user}`,
    agents: `ams:entitlements:agents:${user}`,
    planCredits: `ams:credits:plan:${user}`,
    topupCredits: `ams:credits:topup:${user}`,
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

export async function getEntitlementSnapshot(email: string): Promise<EntitlementSnapshot> {
  const user = normalizeEmail(email)
  const redis = getRedis()

  if (!redis || !user) {
    return {
      configured: Boolean(redis),
      email: user,
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

  const key = keys(user)
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
    email: user,
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
  email: string
  plan: PlanSlug
  subscriptionStatus: SubscriptionStatus
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  resetPlanCredits?: boolean
}) {
  const redis = getRedis()
  const email = normalizeEmail(input.email)
  if (!redis || !email) throw new Error("ENTITLEMENT_STORE_NOT_CONFIGURED")

  const key = keys(email)
  await redis.hset(key.profile, {
    email,
    plan: input.plan,
    subscriptionStatus: input.subscriptionStatus,
    stripeCustomerId: input.stripeCustomerId ?? "",
    stripeSubscriptionId: input.stripeSubscriptionId ?? "",
    updatedAt: new Date().toISOString(),
  })

  if (input.resetPlanCredits) {
    await redis.set(key.planCredits, monthlyCreditsForPlan(input.plan))
  }
}

export async function setSubscriptionStatus(email: string, status: SubscriptionStatus) {
  const redis = getRedis()
  const user = normalizeEmail(email)
  if (!redis || !user) throw new Error("ENTITLEMENT_STORE_NOT_CONFIGURED")
  await redis.hset(keys(user).profile, { subscriptionStatus: status, updatedAt: new Date().toISOString() })
}

export async function grantAgentEntitlement(email: string, slug: string) {
  const redis = getRedis()
  const user = normalizeEmail(email)
  const agentSlug = normalizeSlug(slug)
  if (!redis || !user || !agentSlug) throw new Error("ENTITLEMENT_STORE_NOT_CONFIGURED")
  await redis.sadd(keys(user).agents, agentSlug)
}

export async function grantTopupCredits(email: string, units: number) {
  const redis = getRedis()
  const user = normalizeEmail(email)
  const amount = Math.max(0, Math.floor(units))
  if (!redis || !user || amount < 1) throw new Error("ENTITLEMENT_STORE_NOT_CONFIGURED")
  await redis.incrby(keys(user).topupCredits, amount)
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

export async function consumeCredits(email: string, units = 1) {
  const redis = getRedis()
  const user = normalizeEmail(email)
  const amount = Math.max(1, Math.floor(units))
  if (!redis || !user) throw new Error("ENTITLEMENT_STORE_NOT_CONFIGURED")

  const key = keys(user)
  const script = `
    local plan = tonumber(redis.call('GET', KEYS[1]) or '0')
    local topup = tonumber(redis.call('GET', KEYS[2]) or '0')
    local units = tonumber(ARGV[1])
    if plan + topup < units then
      return {0, plan, topup}
    end
    local fromPlan = math.min(plan, units)
    local newPlan = plan - fromPlan
    local newTopup = topup - (units - fromPlan)
    redis.call('SET', KEYS[1], newPlan)
    redis.call('SET', KEYS[2], newTopup)
    return {1, newPlan, newTopup}
  `

  const result = (await redis.eval(script, [key.planCredits, key.topupCredits], [amount])) as number[]
  return {
    consumed: Number(result?.[0]) === 1,
    planCredits: parseNonNegativeInt(result?.[1]),
    topupCredits: parseNonNegativeInt(result?.[2]),
  }
}

export async function claimStripeEvent(eventId: string): Promise<boolean> {
  const redis = getRedis()
  const id = eventId.trim()
  if (!redis || !id) throw new Error("ENTITLEMENT_STORE_NOT_CONFIGURED")
  const result = await redis.set(`ams:stripe:event:${id}`, "processing", { nx: true, ex: 600 })
  return result === "OK"
}

export async function completeStripeEvent(eventId: string) {
  const redis = getRedis()
  if (!redis) throw new Error("ENTITLEMENT_STORE_NOT_CONFIGURED")
  await redis.set(`ams:stripe:event:${eventId.trim()}`, "done", { ex: 90 * 24 * 60 * 60 })
}

export async function releaseStripeEvent(eventId: string) {
  const redis = getRedis()
  if (!redis) return
  await redis.del(`ams:stripe:event:${eventId.trim()}`)
}
