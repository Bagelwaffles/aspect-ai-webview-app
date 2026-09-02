import { Redis } from "@upstash/redis"

const QUICK_AUDIT_LAUNCH_KEY = "ams:quick-audit:launch:enabled"

type RedisLike = {
  get<T = unknown>(key: string): Promise<T | null>
  set(key: string, value: string): Promise<unknown>
}

type RuntimeOptions = {
  redis?: RedisLike | null
}

type RedisConfig = {
  url: string
  token: string
}

function trimmed(value: string | undefined) {
  const result = value?.trim()
  return result || null
}

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true"
}

export function resolveQuickAuditRedisConfig(env: NodeJS.ProcessEnv = process.env): RedisConfig | null {
  const upstashUrl = trimmed(env.UPSTASH_REDIS_REST_URL)
  const upstashToken = trimmed(env.UPSTASH_REDIS_REST_TOKEN)
  if (upstashUrl && upstashToken) return { url: upstashUrl, token: upstashToken }

  const kvUrl = trimmed(env.KV_REST_API_URL)
  const kvToken = trimmed(env.KV_REST_API_TOKEN)
  if (kvUrl && kvToken) return { url: kvUrl, token: kvToken }

  return null
}

function redisClient(env: NodeJS.ProcessEnv = process.env): RedisLike | null {
  const config = resolveQuickAuditRedisConfig(env)
  return config ? new Redis(config) : null
}

function runtimeRedis(env: NodeJS.ProcessEnv, options: RuntimeOptions) {
  return Object.prototype.hasOwnProperty.call(options, "redis") ? options.redis ?? null : redisClient(env)
}

function launchValueEnabled(value: unknown) {
  return value === true || value === "true" || value === "enabled" || value === 1 || value === "1"
}

export function quickAuditE2EProven(env: NodeJS.ProcessEnv = process.env) {
  return enabled(env.AMS_QUICK_AUDIT_E2E_PROVEN)
}

export function normalizeQuickAuditLiveStripeSecret(env: NodeJS.ProcessEnv = process.env) {
  const dedicated = env.AMS_STRIPE_QUICK_AUDIT_LIVE_SECRET_KEY?.trim()
  if (/^(sk|rk)_live_/.test(dedicated ?? "")) return

  const shared = env.STRIPE_SECRET_KEY?.trim()
  if (/^(sk|rk)_live_/.test(shared ?? "")) {
    env.AMS_STRIPE_QUICK_AUDIT_LIVE_SECRET_KEY = shared
  }
}

export function quickAuditInfrastructureReady(env: NodeJS.ProcessEnv = process.env) {
  normalizeQuickAuditLiveStripeSecret(env)

  const liveSecretReady = /^(sk|rk)_live_/.test(
    env.AMS_STRIPE_QUICK_AUDIT_LIVE_SECRET_KEY?.trim() ?? "",
  )
  const livePriceReady = (env.AMS_STRIPE_QUICK_AUDIT_LIVE_PRICE_ID?.trim() ?? "").startsWith("price_")
  const liveWebhookReady = (
    env.AMS_STRIPE_QUICK_AUDIT_LIVE_WEBHOOK_SECRET?.trim().startsWith("whsec_") ?? false
  ) || (
    env.AMS_STRIPE_WEBHOOK_MODE?.trim().toLowerCase() === "live" &&
    (env.STRIPE_WEBHOOK_SECRET?.trim().startsWith("whsec_") ?? false)
  )
  const redisReady = resolveQuickAuditRedisConfig(env) !== null

  return liveSecretReady && livePriceReady && liveWebhookReady && redisReady
}

export async function isQuickAuditRuntimeLaunchEnabled(
  env: NodeJS.ProcessEnv = process.env,
  options: RuntimeOptions = {},
) {
  if (!quickAuditE2EProven(env)) return false
  if (!quickAuditInfrastructureReady(env)) return false

  const redis = runtimeRedis(env, options)
  if (!redis) return false

  const value = await redis.get<unknown>(QUICK_AUDIT_LAUNCH_KEY).catch(() => null)
  return launchValueEnabled(value)
}

export async function ensureQuickAuditRuntimeLaunchState(
  env: NodeJS.ProcessEnv = process.env,
  options: RuntimeOptions = {},
) {
  normalizeQuickAuditLiveStripeSecret(env)
  const launchEnabled = await isQuickAuditRuntimeLaunchEnabled(env, options)

  env.AMS_QUICK_AUDIT_PUBLIC_SALES_ENABLED = launchEnabled ? "true" : "false"
  env.AMS_QUICK_AUDIT_FULFILLMENT_READY = launchEnabled ? "true" : "false"

  return launchEnabled
}

export async function setQuickAuditRuntimeLaunchEnabled(
  launchEnabled: boolean,
  env: NodeJS.ProcessEnv = process.env,
  options: RuntimeOptions = {},
) {
  if (launchEnabled && !quickAuditE2EProven(env)) {
    throw new Error("QUICK_AUDIT_E2E_NOT_PROVEN")
  }

  if (launchEnabled && !quickAuditInfrastructureReady(env)) {
    throw new Error("QUICK_AUDIT_INFRASTRUCTURE_NOT_READY")
  }

  const redis = runtimeRedis(env, options)
  if (!redis) throw new Error("QUICK_AUDIT_LAUNCH_STORE_UNAVAILABLE")

  await redis.set(QUICK_AUDIT_LAUNCH_KEY, launchEnabled ? "enabled" : "disabled")
  return launchEnabled
}
