import { test } from "node:test"
import assert from "node:assert/strict"

import { probeOwnerPilotProviderConnectivity } from "../lib/server/quick-audit-owner-connectivity"
import { RESEND_PREVIEW_BRANCH } from "../lib/server/quick-audit-resend-preview-preflight"
import { AMS_PILOT_STRIPE_ACCOUNT } from "../lib/server/quick-audit-isolated-stripe-pilot"

const env: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: RESEND_PREVIEW_BRANCH,
  AMS_STRIPE_PILOT_ACCOUNT_ID: AMS_PILOT_STRIPE_ACCOUNT,
  AMS_STRIPE_PILOT_TEST_SECRET_KEY: "sk_test_local_fake_no_provider",
  AMS_STRIPE_PILOT_REDIS_REST_URL: "https://isolated-connectivity-example.upstash.io",
  AMS_STRIPE_PILOT_REDIS_REST_TOKEN: "testfixture",
  AMS_STRIPE_PILOT_REDIS_NAMESPACE: "ams:preview:stripe-pilot:connectivity-test:",
  AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL: "https://accepted-quetzal-206056.upstash.io",
}

test("read-only owner probe identifies intended sandbox and Resend HTTP path without admin token", async () => {
  let readCount = 0
  let resendCount = 0
  const result = await probeOwnerPilotProviderConnectivity({
    env,
    readSandboxAccountId: async key => {
      readCount++
      assert.equal(key, env.AMS_STRIPE_PILOT_TEST_SECRET_KEY)
      return AMS_PILOT_STRIPE_ACCOUNT
    },
    fetcher: async (url, options) => {
      resendCount++
      assert.equal(String(url), "https://api.resend.com/domains/60c30272-c705-493a-9be4-0b7df9ab31c8")
      assert.equal(options?.method, "GET")
      assert.equal(new Headers(options?.headers).has("Authorization"), false)
      return new Response("Unauthorized", { status: 401 })
    },
  })
  assert.equal(result.ok, true)
  assert.equal(result.code, "OWNER_PILOT_SECURE_RUNTIME_CONNECTIVITY_PASSED")
  assert.equal(result.checks.stripeSandboxIdentityVerified, true)
  assert.equal(result.checks.resendApiResponded, true)
  assert.equal(result.checks.resendDomainApiProofVerified, false)
  assert.equal(result.checks.stripeOriginWebhookVerified, false)
  assert.equal(result.checks.paymentPerformed, false)
  assert.equal(result.checks.emailSent, false)
  assert.equal(result.checks.allOperationalSwitchesOff, true)
  assert.equal(readCount, 1)
  assert.equal(resendCount, 1)
})

test("wrong Stripe account never counts as an accepted isolated sandbox", async () => {
  const result = await probeOwnerPilotProviderConnectivity({
    env,
    readSandboxAccountId: async () => "acct_another_sandbox",
    fetcher: async () => new Response(null, { status: 403 }),
  })
  assert.equal(result.ok, false)
  assert.equal(result.checks.stripeSandboxIdentityVerified, false)
  assert.equal(result.checks.resendApiResponded, true)
})

test("Resend transport failures cannot masquerade as provider verification", async () => {
  const result = await probeOwnerPilotProviderConnectivity({
    env,
    readSandboxAccountId: async () => AMS_PILOT_STRIPE_ACCOUNT,
    fetcher: async () => { throw new Error("network blocked") },
  })
  assert.equal(result.ok, false)
  assert.equal(result.checks.resendApiResponded, false)
  assert.equal(result.checks.resendDomainApiProofVerified, false)
})

test("all send and payment switches, production, wrong branch, and shared Redis block BEFORE remote calls", async () => {
  for (const change of [
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED: "true" },
    { AMS_STRIPE_PILOT_FULFILLMENT_ENABLED: "true" },
    { AMS_QUICK_AUDIT_PILOT_DISPATCH_ENABLED: "true" },
    { AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "true" },
    { AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED: "true" },
    { AMS_STRIPE_PILOT_TEST_SECRET_KEY: "" },
    { AMS_STRIPE_PILOT_ACCOUNT_ID: "acct_wrong" },
    { AMS_STRIPE_PILOT_REDIS_REST_URL: env.AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL },
  ]) {
    let remoteCalls = 0
    const result = await probeOwnerPilotProviderConnectivity({
      env: { ...env, ...change },
      readSandboxAccountId: async () => { remoteCalls++; return AMS_PILOT_STRIPE_ACCOUNT },
      fetcher: async () => { remoteCalls++; return new Response(null, { status: 401 }) },
    })
    assert.equal(result.ok, false, JSON.stringify(change))
    assert.equal(result.code, "OWNER_PILOT_PROVIDER_CONNECTIVITY_BLOCKED")
    assert.equal(remoteCalls, 0)
  }
})
