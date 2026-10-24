import { test } from "node:test"
import assert from "node:assert/strict"

import {
  runOwnerResendPreviewProofStoreProbe,
  type ResendPreviewProbeRedis,
} from "../lib/server/quick-audit-resend-preview-probe"
import { AMS_RESEND_DOMAIN_ID } from "../lib/server/quick-audit-resend-domain-proof"
import {
  RESEND_PREVIEW_BRANCH,
  RESEND_PREVIEW_REDIS_HOST,
} from "../lib/server/quick-audit-resend-preview-preflight"

const namespace = "ams:preview:quick-audit:resend-owner-probe:"
const env: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: RESEND_PREVIEW_BRANCH,
  AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "false",
  AMS_RESEND_SEND_API_KEY: "synthetic-sending-only-key",
  AMS_RESEND_DOMAIN_ID,
  AMS_OWNER_EMAIL: "owner@example.test",
  AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL: "owner@example.test",
  AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL: `https://${RESEND_PREVIEW_REDIS_HOST}`,
  AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_TOKEN: "synthetic-token",
  AMS_QUICK_AUDIT_RESEND_PROOF_NAMESPACE: namespace,
}

function fixture() {
  const values = new Map<string, string>()
  const writes: Array<{ key: string; ttl: number; nx: boolean }> = []
  const deletes: string[] = []
  const redis: ResendPreviewProbeRedis = {
    async set(key, value, options) {
      writes.push({ key, ttl: options.ex, nx: options.nx })
      if (values.has(key)) return null
      values.set(key, value)
      return "OK"
    },
    async get(key) { return (values.get(key) ?? null) as never },
    async del(key) {
      deletes.push(key)
      return values.delete(key) ? 1 : 0
    },
  }
  return { redis, writes, deletes, values }
}

test("writes, reads and deletes exactly one namespaced ephemeral nonpayment key", async () => {
  const f = fixture()
  const passed = await runOwnerResendPreviewProofStoreProbe(f.redis, env, {
    identifier: "owner-probe-a1",
    marker: "synthetic-value",
  })
  assert.equal(passed, true)
  assert.deepEqual(f.writes, [{
    key: namespace + "nonpayment-store-probe:owner-probe-a1",
    ttl: 45,
    nx: true,
  }])
  assert.deepEqual(f.deletes, [f.writes[0].key])
  assert.equal(f.values.size, 0)
})

test("fails closed without mutation for wrong branch, production, sending enabled, bad namespace or missing token", async () => {
  for (const overrides of [
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "true" },
    { AMS_QUICK_AUDIT_RESEND_PROOF_NAMESPACE: "ams:prod:quick-audit:owner-probe:" },
    { AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_TOKEN: "" },
    { UPSTASH_REDIS_REST_URL: env.AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL },
  ]) {
    const f = fixture()
    const result = await runOwnerResendPreviewProofStoreProbe(f.redis, {
      ...env, ...overrides,
    }, { identifier: "owner-probe-a1", marker: "synthetic-value" })
    assert.equal(result, false)
    assert.equal(f.writes.length, 0)
    assert.equal(f.deletes.length, 0)
  }
})

test("does not overwrite collision keys or delete keys it did not create", async () => {
  const f = fixture()
  const key = namespace + "nonpayment-store-probe:owner-probe-a1"
  f.values.set(key, "existing-value")
  assert.equal(await runOwnerResendPreviewProofStoreProbe(f.redis, env, {
    identifier: "owner-probe-a1", marker: "synthetic-value",
  }), false)
  assert.equal(f.values.get(key), "existing-value")
  assert.equal(f.deletes.length, 0)
})

test("read failure causes cleanup and fail-closed result", async () => {
  const f = fixture()
  f.redis.get = async () => { throw new Error("synthetic read error") }
  assert.equal(await runOwnerResendPreviewProofStoreProbe(f.redis, env, {
    identifier: "owner-probe-a1", marker: "synthetic-value",
  }), false)
  assert.equal(f.values.size, 0)
  assert.equal(f.deletes.length, 1)
})

test("deletion failure never reports success; the temporary key has a TTL", async () => {
  const f = fixture()
  f.redis.del = async () => { throw new Error("synthetic delete error") }
  assert.equal(await runOwnerResendPreviewProofStoreProbe(f.redis, env, {
    identifier: "owner-probe-a1", marker: "synthetic-value",
  }), false)
  assert.equal(f.writes[0]?.ttl, 45)
})

test("invalid probe identifier causes no datastore activity", async () => {
  const f = fixture()
  assert.equal(await runOwnerResendPreviewProofStoreProbe(f.redis, env, {
    identifier: "../../prod", marker: "synthetic-value",
  }), false)
  assert.equal(f.writes.length, 0)
})

test("incorrect read-back value causes cleanup and fail-closed result", async () => {
  const f = fixture()
  f.redis.get = async () => "wrong-value" as never
  assert.equal(await runOwnerResendPreviewProofStoreProbe(f.redis, env, {
    identifier: "owner-probe-a1", marker: "synthetic-value",
  }), false)
  assert.equal(f.values.size, 0)
  assert.equal(f.deletes.length, 1)
})
