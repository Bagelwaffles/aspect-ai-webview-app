/**
 * Owner-only, no-send permission probe for PR #316's existing isolated
 * Stripe TEST Redis. Uses a disposable, unaddressable buyer-link namespace
 * key with a short TTL, never a real request ID or delivery record.
 */
import { randomUUID } from "node:crypto"
import { Redis } from "@upstash/redis"
import { QuickAuditDeliveryOutbox, BUYER_LINK_DELIVERY_PREFIX } from "./quick-audit-delivery-outbox"
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
  eval(script: string, keys: string[], args: string[]): Promise<unknown>
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
  const requestId = "probe-" + randomUUID().replace(/-/g, "")
  const key = BUYER_LINK_DELIVERY_PREFIX + requestId
  // Exercise the actual adapter, but confine every operation to this disposable
  // key and override its normal retention with a 45-second failsafe.
  const assertKey = (candidate: string) => {
    if (candidate !== key) throw new Error("PROBE_KEY_SCOPE_DENIED")
  }
  let created = false
  let phase = "WRITE"
  let code = "BUYER_LINK_REDIS_WRITE_FAILED"
  const outbox = new QuickAuditDeliveryOutbox({
    get: async <T = unknown>(candidate: string): Promise<T | null> => {
      assertKey(candidate)
      return await redis.get(candidate) as T | null
    },
    set: async (candidate, value, options) => {
      assertKey(candidate)
      // Cleanup even if SET succeeds but its response is lost.
      try {
        const result = await redis.set(candidate, value, { ...options, ex: 45 })
        created = result === "OK" || result === true
        return result
      } catch (error) {
        const classification = classifyWriteError(error)
        created = classification !== "BUYER_LINK_REDIS_WRITE_FORBIDDEN" &&
          classification !== "BUYER_LINK_REDIS_TOKEN_REJECTED"
        throw error
      }
    },
    eval: async (script, keys, args) => {
      if (keys.length !== 1 || args.length !== 3) throw new Error("PROBE_KEY_SCOPE_DENIED")
      assertKey(keys[0])
      phase = "CAS"
      return redis.eval(script, keys, [args[0], args[1], "45"])
    },
  }, BUYER_LINK_DELIVERY_PREFIX)
  try {
    const recipient = "redis-probe@example.invalid"
    await outbox.enqueue({
      auditId: requestId, requestId, checkoutSessionId: requestId,
      recipient, paidAndPersisted: true,
    })
    if ((await outbox.read(requestId))?.state !== "queued") {
      code = "BUYER_LINK_REDIS_READBACK_FAILED"
    } else {
      const claim = await outbox.claim(requestId, {
        enabled: true, ownerOnly: true, ownerEmail: recipient,
      })
      if (!claim || (await outbox.read(requestId))?.state !== "sending") {
        code = "BUYER_LINK_REDIS_CAS_CLAIM_FAILED"
      } else if (!await outbox.finish(claim, { state: "failed", code: "DISPOSABLE_PROBE_ONLY" }) ||
                 (await outbox.read(requestId))?.state !== "failed") {
        code = "BUYER_LINK_REDIS_CAS_FINISH_FAILED"
      } else if (await outbox.finish(claim, { state: "failed", code: "DISPOSABLE_PROBE_ONLY" })) {
        code = "BUYER_LINK_REDIS_CAS_REPLAY_ACCEPTED"
      } else {
        code = "BUYER_LINK_REDIS_PROBE_PASS"
      }
    }
  } catch (error: unknown) {
    code = classifyWriteError(error)
    if (phase === "CAS" && code === "BUYER_LINK_REDIS_WRITE_FORBIDDEN") {
      code = "BUYER_LINK_REDIS_CAS_FORBIDDEN"
    }
  }
  if (created) {
    try {
      const deleted = Number(await redis.del(key))
      if ((deleted !== 0 && deleted !== 1) || await redis.get(key) !== null) {
        code = "BUYER_LINK_REDIS_CLEANUP_UNCONFIRMED"
      }
    } catch {
      code = "BUYER_LINK_REDIS_CLEANUP_UNCONFIRMED"
    }
  }
  // A write whose response was lost expires automatically after 45 seconds.
  return { ok: code === "BUYER_LINK_REDIS_PROBE_PASS", code }
}
