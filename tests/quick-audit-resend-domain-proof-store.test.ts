import { test } from "node:test"
import assert from "node:assert/strict"

import {
  PreviewResendDomainProofStore,
  verifyAndRecordResendDomainForOwner,
  type ResendDomainProofRedis,
} from "../lib/server/quick-audit-resend-domain-proof-store"
import { AMS_RESEND_DOMAIN, AMS_RESEND_DOMAIN_ID } from "../lib/server/quick-audit-resend-domain-proof"

const now = new Date("2026-10-23T18:00:00.000Z")
const prefix = "ams:preview:quick-audit:owner-pilot-test:"
function redisFixture() {
  const map = new Map<string, string>()
  const writes: Array<{ key: string; ttl: number }> = []
  const redis: ResendDomainProofRedis = {
    async get(key) { return (map.get(key) ?? null) as never },
    async set(key, value, opts) {
      map.set(key, value)
      writes.push({ key, ttl: opts.ex })
      return "OK"
    },
  }
  return { map, writes, redis }
}
const validProof = {
  domainId: AMS_RESEND_DOMAIN_ID,
  domainName: AMS_RESEND_DOMAIN,
  status: "verified",
  sending: "enabled",
  source: "resend-domain-api",
  verifiedAt: now.toISOString(),
} as const
const previewEnv: NodeJS.ProcessEnv = { NODE_ENV: "test", VERCEL_ENV: "preview" }

test("requires isolated Preview-only namespace, never default production storage", () => {
  for (const namespace of [
    "",
    "ams:prod:quick-audit:owner-pilot-test:",
    "ams:preview:quick-audit:",
    "ams:preview:quick-audit:../../prod:",
    "ams:preview:quick-audit:bad:",
  ]) {
    assert.throws(() => new PreviewResendDomainProofStore(redisFixture().redis, namespace),
      /AMS_RESEND_PROOF_PREVIEW_NAMESPACE_REQUIRED/)
  }
})

test("stores only short-lived provider-verified proof under scoped Redis key", async () => {
  const f = redisFixture()
  const store = new PreviewResendDomainProofStore(f.redis, prefix, () => now)
  assert.equal(await store.readDomainProof(), null)
  await store.saveOwnerVerifiedProof(validProof)
  assert.deepEqual(await store.readDomainProof(), validProof)
  assert.deepEqual(f.writes, [{
    key: prefix + "resend-domain-proof:" + AMS_RESEND_DOMAIN_ID,
    ttl: 900,
  }])
})

test("rejects expired, future-dated, malformed and non-provider proof", async () => {
  const f = redisFixture()
  const store = new PreviewResendDomainProofStore(f.redis, prefix, () => now)
  for (const invalid of [
    { ...validProof, verifiedAt: "2026-10-23T17:40:00.000Z" },
    { ...validProof, verifiedAt: "2026-10-23T18:01:00.000Z" },
    { ...validProof, source: "manual-owner" },
    { ...validProof, domainId: "11111111-2222-3333-4444-555555555555" },
  ]) {
    await assert.rejects(store.saveOwnerVerifiedProof(invalid as typeof validProof),
      /AMS_RESEND_PROOF_EXPIRED_OR_INVALID/)
  }
  f.map.set(prefix + "resend-domain-proof:" + AMS_RESEND_DOMAIN_ID, "not json")
  assert.equal(await store.readDomainProof(), null)
})

test("owner-only verifier uses administrative credential separately and stores proof", async () => {
  const f = redisFixture(), store = new PreviewResendDomainProofStore(f.redis, prefix, () => now)
  const captured: string[] = []
  const result = await verifyAndRecordResendDomainForOwner({
    fullAccessKey: "fake-owner-only-admin",
    env: previewEnv,
    now,
    proofStore: store,
    fetcher: async (_url, opts) => {
      captured.push(new Headers(opts?.headers).get("Authorization") ?? "")
      return Response.json({
        id: AMS_RESEND_DOMAIN_ID,
        name: AMS_RESEND_DOMAIN,
        status: "verified",
        capabilities: { sending: "enabled", receiving: "disabled" },
      })
    },
  })
  assert.equal(result, true)
  assert.deepEqual(captured, ["Bearer fake-owner-only-admin"])
  assert.deepEqual(await store.readDomainProof(), validProof)
})

test("owner verification cannot write proof in production or if Resend is not verified", async () => {
  const f = redisFixture(), store = new PreviewResendDomainProofStore(f.redis, prefix, () => now)
  await assert.rejects(verifyAndRecordResendDomainForOwner({
    fullAccessKey: "dummy",
    env: { ...previewEnv, VERCEL_ENV: "production" },
    proofStore: store,
  }), /AMS_RESEND_PROOF_PREVIEW_ONLY/)
  const passed = await verifyAndRecordResendDomainForOwner({
    fullAccessKey: "dummy",
    env: previewEnv,
    proofStore: store,
    now,
    fetcher: async () => Response.json({
      id: AMS_RESEND_DOMAIN_ID,
      name: AMS_RESEND_DOMAIN,
      status: "pending",
      capabilities: { sending: "enabled" },
    }),
  })
  assert.equal(passed, false)
  assert.equal(f.writes.length, 0)
})
