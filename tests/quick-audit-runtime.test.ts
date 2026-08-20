import assert from "node:assert/strict"
import test from "node:test"

import {
  ensureQuickAuditRuntimeLaunchState,
  isQuickAuditRuntimeLaunchEnabled,
  quickAuditInfrastructureReady,
  resolveQuickAuditRedisConfig,
  setQuickAuditRuntimeLaunchEnabled,
} from "../lib/server/quick-audit-runtime"

function env(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    AMS_STRIPE_QUICK_AUDIT_LIVE_SECRET_KEY: ["sk", "live", "fixture"].join("_"),
    AMS_STRIPE_QUICK_AUDIT_LIVE_PRICE_ID: "price_fixture",
    AMS_STRIPE_QUICK_AUDIT_LIVE_WEBHOOK_SECRET: ["whsec", "fixture"].join("_"),
    UPSTASH_REDIS_REST_URL: "https://fixture-upstash.example",
    UPSTASH_REDIS_REST_TOKEN: "fixture-upstash-token",
    ...overrides,
  }
}

function fakeRedis(initial: unknown) {
  let value = initial
  const writes: Array<{ key: string; value: string }> = []
  return {
    writes,
    client: {
      async get<T = unknown>() {
        return value as T
      },
      async set(key: string, next: string) {
        value = next
        writes.push({ key, value: next })
        return "OK"
      },
    },
  }
}

test("Quick Audit Redis config keeps provider URL and token paired", () => {
  const selected = resolveQuickAuditRedisConfig(env({
    UPSTASH_REDIS_REST_URL: "https://partial-upstash.example",
    UPSTASH_REDIS_REST_TOKEN: "",
    KV_REST_API_URL: "https://complete-kv.example",
    KV_REST_API_TOKEN: "complete-kv-token",
  }))

  assert.deepEqual(selected, {
    url: "https://complete-kv.example",
    token: "complete-kv-token",
  })
})

test("Quick Audit infrastructure rejects cross-provider partial Redis config", () => {
  const input = env({
    UPSTASH_REDIS_REST_URL: "https://partial-upstash.example",
    UPSTASH_REDIS_REST_TOKEN: "",
    KV_REST_API_URL: "",
    KV_REST_API_TOKEN: "orphan-kv-token",
  })

  assert.equal(resolveQuickAuditRedisConfig(input), null)
  assert.equal(quickAuditInfrastructureReady(input), false)
})

test("durable Redis launch state overrides stale enabled process flags", async () => {
  const input = env({
    AMS_QUICK_AUDIT_PUBLIC_SALES_ENABLED: "true",
    AMS_QUICK_AUDIT_FULFILLMENT_READY: "true",
  })
  const redis = fakeRedis("disabled")

  assert.equal(await isQuickAuditRuntimeLaunchEnabled(input, { redis: redis.client }), false)
})

test("checkout preparation clears stale enabled flags when durable switch is disabled", async () => {
  const input = env({
    AMS_QUICK_AUDIT_PUBLIC_SALES_ENABLED: "true",
    AMS_QUICK_AUDIT_FULFILLMENT_READY: "true",
  })
  const redis = fakeRedis("disabled")

  assert.equal(await ensureQuickAuditRuntimeLaunchState(input, { redis: redis.client }), false)
  assert.equal(input.AMS_QUICK_AUDIT_PUBLIC_SALES_ENABLED, "false")
  assert.equal(input.AMS_QUICK_AUDIT_FULFILLMENT_READY, "false")
})

test("checkout preparation enables handler flags only when durable switch is enabled", async () => {
  const input = env({
    AMS_QUICK_AUDIT_PUBLIC_SALES_ENABLED: "false",
    AMS_QUICK_AUDIT_FULFILLMENT_READY: "false",
  })
  const redis = fakeRedis("enabled")

  assert.equal(await ensureQuickAuditRuntimeLaunchState(input, { redis: redis.client }), true)
  assert.equal(input.AMS_QUICK_AUDIT_PUBLIC_SALES_ENABLED, "true")
  assert.equal(input.AMS_QUICK_AUDIT_FULFILLMENT_READY, "true")
})

test("operator launch-state writes remain durable", async () => {
  const input = env()
  const redis = fakeRedis("enabled")

  assert.equal(await setQuickAuditRuntimeLaunchEnabled(false, input, { redis: redis.client }), false)
  assert.equal(redis.writes.length, 1)
  assert.equal(redis.writes[0]?.value, "disabled")
})
