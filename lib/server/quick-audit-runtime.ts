import { Redis } from "@upstash/redis"

const QUICK_AUDIT_LAUNCH_KEY = "ams:quick-audit:launch:enabled"

type RedisLike = {
  get<T = unknown>(key: string): Promise<T | null>
  set(key: string, value: string): Promise<unknown>
}

function redisClient(env: NodeJS.ProcessEnv = process.env): RedisLike | null {
  const url = (env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL)?.trim()
  const token = (env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN)?.trim()
  return url && token ? new Redis({ url, token }) : null
}

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true"
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
  const redisReady = Boolean(
    (env.UPSTASH_REDIS_REST_URL?.trim() || env.KV_REST_API_URL?.trim()) &&
    (env.UPSTASH_REDIS_REST_TOKEN?.trim() || env.KV_REST_API_TOKEN?.trim()),
  )

  return liveSecretReady && livePriceReady && liveWebhookReady && redisReady
}

export async function isQuickAuditRuntimeLaunchEnabled(env: NodeJS.ProcessEnv = process.env) {
  if (!quickAuditInfrastructureReady(env)) return false

  if (
    enabled(env.AMS_QUICK_AUDIT_PUBLIC_SALES_ENABLED) &&
    enabled(env.AMS_QUICK_AUDIT_FULFILLMENT_READY)
  ) {
    return true
  }

  const redis = redisClient(env)
  if (!redis) return false

  const value = await redis.get<unknown>(QUICK_AUDIT_LAUNCH_KEY).catch(() => null)
  return value === true || value === "true" || value === "enabled" || value === 1 || value === "1"
}

export async function ensureQuickAuditRuntimeLaunchState(env: NodeJS.ProcessEnv = process.env) {
  normalizeQuickAuditLiveStripeSecret(env)
  const launchEnabled = await isQuickAuditRuntimeLaunchEnabled(env)
  if (launchEnabled) {
    env.AMS_QUICK_AUDIT_PUBLIC_SALES_ENABLED = "true"
    env.AMS_QUICK_AUDIT_FULFILLMENT_READY = "true"
  }
  return launchEnabled
}

export async function setQuickAuditRuntimeLaunchEnabled(
  launchEnabled: boolean,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (launchEnabled && !quickAuditInfrastructureReady(env)) {
    throw new Error("QUICK_AUDIT_INFRASTRUCTURE_NOT_READY")
  }

  const redis = redisClient(env)
  if (!redis) throw new Error("QUICK_AUDIT_LAUNCH_STORE_UNAVAILABLE")

  await redis.set(QUICK_AUDIT_LAUNCH_KEY, launchEnabled ? "enabled" : "disabled")
  return launchEnabled
}
