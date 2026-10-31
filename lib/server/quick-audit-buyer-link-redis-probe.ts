/**
 * Owner-only, no-send permission probe for PR #316's existing isolated
 * Stripe TEST Redis. Uses a disposable, unaddressable buyer-link namespace
 * key with a short TTL, never a real request ID or delivery record.
 */
import { randomUUID } from "node:crypto"
import { Redis } from "@upstash/redis"
import { pilotStorageConfiguration } from "./quick-audit-isolated-stripe-pilot"

const TARGET_HOST = "internal-chicken-238070.upstash.io"
const OFF_KEYS = [
  "AMS_QUICK_AUDIT_BUYER_DISPATCH_ENABLED",
  "AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED",
  "AMS_QUICK_AUDIT_PILOT_DISPATCH_ENABLED",
  "AMS_STRIPE_PILOT_FULFILLMENT_ENABLED",
  "AMS_STRIPE_PILOT_CHECKOUT_ENABLED",
  "AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED",
  "AMS_STRIPE_PILOT_HANDOFF_ENABLED",
  "AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED",
  "AMS_QUICK_AUDIT_PUBLIC_CHECKOUT_ENABLED",
] as const

export type BuyerLinkWriteProbeRedis = {
  set(key: string, value: string, options: { nx: true; ex: number }): Promise<unknown>
  get(key: string): Promise<unknown>
  del(key: string): Promise<unknown>
}
export type BuyerLinkWriteProbeResult = { ok: boolean; code: string }

function classifyWriteError(error: unknown): string {
  // Raw messages may contain provider details; only return fixed status codes.
  const message = error instanceof Error ? error.message.slice(0, 500) : ""
  if (/NOPERM|permission|forbidden|READONLY|read.only|ACL|command not allowed/i.test(message)) {
    return "BUYER_LINK_REDIS_WRITE_FORBIDDEN"
  }
  if (/unauthorized|401|403|WRONGPASS|invalid.token|authentication|auth failed/i.test(message)) {
    return "BUYER_LINK_REDIS_TOKEN_REJECTED"
  }
  if (/timeout|timed out|network|fetch failed|ECONNRESET|socket/i.test(message)) {
    return "BUYER_LINK_REDIS_TIMEOUT"
  }
  return "BUYER_LINK_REDIS_WRITE_FAILED"
}

export async function probeBuyerLinkRedisWrite(input: {
  env?: NodeJS.ProcessEnv
  redis?: BuyerLinkWriteProbeRedis
} = {}): Promise<BuyerLinkWriteProbeResult> {
  const env = input.env ?? process.env
  if (OFF_KEYS.some(name => env[name] !== "false")) {
    return { ok: false, code: "BUYER_LINK_REDIS_SCOPE_DENIED" }
  }
  const storage = pilotStorageConfiguration(env)
  if (!storage.ready || storage.host !== TARGET_HOST) {
    return { ok: false, code: "BUYER_LINK_REDIS_STORAGE_UNVERIFIED" }
  }
  const url = env.AMS_STRIPE_PILOT_REDIS_REST_URL?.trim()
  const token = env.AMS_STRIPE_PILOT_REDIS_REST_TOKEN?.trim()
  if (!url || !token) {
    return { ok: false, code: "BUYER_LINK_REDIS_STORAGE_UNVERIFIED" }
  }

  const redis: BuyerLinkWriteProbeRedis = input.redis ?? new Redis({ url, token })
  // 'probe-' cannot match any real Quick Audit requestId at the dispatch API.
  const nonce = randomUUID().replace(/-/g, "")
  const key = "ams:quick-audit:buyer-link:delivery:probe-" + nonce
  const value = "write-test-" + nonce
  let created = false
  let code = "BUYER_LINK_REDIS_WRITE_FAILED"
  try {
    const acknowledged = await redis.set(key, value, { nx: true, ex: 45 })
    if (acknowledged === "OK" || acknowledged === true) {
      created = true
      code = await redis.get(key) === value
        ? "BUYER_LINK_REDIS_PROBE_PASS" : "BUYER_LINK_REDIS_READBACK_FAILED"
    } else {
      code = "BUYER_LINK_REDIS_WRITE_NOT_ACKNOWLEDGED"
    }
  } catch (error: unknown) {
    code = classifyWriteError(error)
  }
  if (created) {
    try {
      if (Number(await redis.del(key)) !== 1) {
        code = "BUYER_LINK_REDIS_CLEANUP_UNCONFIRMED"
      }
    } catch {
      code = "BUYER_LINK_REDIS_CLEANUP_UNCONFIRMED"
    }
  }
  // A write whose response was lost expires automatically after 45 seconds.
  return { ok: code === "BUYER_LINK_REDIS_PROBE_PASS", code }
}
