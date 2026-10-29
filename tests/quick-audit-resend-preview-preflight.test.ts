import { test } from "node:test"
import assert from "node:assert/strict"

import { inspectResendPreviewPreflight, RESEND_PREVIEW_BRANCH,
  RESEND_PREVIEW_REDIS_HOST } from "../lib/server/quick-audit-resend-preview-preflight"
import { AMS_RESEND_DOMAIN_ID } from "../lib/server/quick-audit-resend-domain-proof"

const safe: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: RESEND_PREVIEW_BRANCH,
  AMS_RESEND_SEND_API_KEY: "fake-should-never-be-in-output",
  AMS_RESEND_DOMAIN_ID,
  AMS_OWNER_EMAIL: "owner@example.com",
  AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL: "owner@example.com",
  AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL: "https://" + RESEND_PREVIEW_REDIS_HOST,
  AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_TOKEN: "fake-redis-token-should-never-be-output",
  AMS_QUICK_AUDIT_RESEND_PROOF_NAMESPACE: "ams:preview:quick-audit:resend-owner-test:",
}

test("safe preview configuration is only a configuration preflight, not send approval", () => {
  const result = inspectResendPreviewPreflight(safe)
  assert.equal(result.status, "configuration-ready")
  assert.ok(Object.values(result.checks).every(Boolean))
  assert.equal(result.remainingEvidence.length, 5)
  const output = JSON.stringify(result)
  assert.doesNotMatch(output, /fake-should-never-be-in-output|fake-redis-token/)
  assert.ok(!("apiKey" in result))
})

test("wrong environment, branch, or enabled auto-send blocks Preview preflight", () => {
  for (const env of [
    { ...safe, VERCEL_ENV: "production" },
    { ...safe, VERCEL_GIT_COMMIT_REF: "main" },
    { ...safe, AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "true" },
    { ...safe, AMS_RESEND_SEND_API_KEY: "" },
    { ...safe, AMS_RESEND_DOMAIN_ID: "some-other-domain-id" },
  ]) {
    assert.equal(inspectResendPreviewPreflight(env).status, "blocked")
  }
})

test("owner-only authentication and inbox destination must be configured", () => {
  for (const env of [
    { ...safe, AMS_OWNER_EMAIL: "" },
    { ...safe, AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL: "" },
    { ...safe, AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL: "not an email" },
  ]) {
    assert.equal(inspectResendPreviewPreflight(env).status, "blocked")
  }
})

test("prohibits production/default Redis, unknown preview host and unscoped namespace", () => {
  for (const env of [
    { ...safe, AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL: "https://production-db.upstash.io" },
    { ...safe, AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL: "http://" + RESEND_PREVIEW_REDIS_HOST },
    { ...safe, AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL: "https://" + RESEND_PREVIEW_REDIS_HOST + ".evil.com" },
    { ...safe, AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL: "https://" + RESEND_PREVIEW_REDIS_HOST + "/redis?token=leak" },
    { ...safe, AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL: "" },
    { ...safe, AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_TOKEN: "" },
    { ...safe, AMS_QUICK_AUDIT_RESEND_PROOF_NAMESPACE: "ams:prod:quick-audit:owner-test:" },
    { ...safe, AMS_QUICK_AUDIT_RESEND_PROOF_NAMESPACE: "ams:preview:quick-audit:../../prod:" },
    { ...safe, UPSTASH_REDIS_REST_URL: "https://" + RESEND_PREVIEW_REDIS_HOST },
  ]) {
    assert.equal(inspectResendPreviewPreflight(env).status, "blocked")
  }
})

test("bare Resend key/domain without owner and isolated store never passes", () => {
  const result = inspectResendPreviewPreflight({
    NODE_ENV: "test",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: RESEND_PREVIEW_BRANCH,
    AMS_RESEND_SEND_API_KEY: "fake-secret",
    AMS_RESEND_DOMAIN_ID,
  })
  assert.equal(result.status, "blocked")
  assert.equal(result.checks.restrictedSendingKeyPresent, true)
  assert.equal(result.checks.previewProofStoreConfigured, false)
  assert.equal(result.checks.ownerSessionConfigured, false)
})
