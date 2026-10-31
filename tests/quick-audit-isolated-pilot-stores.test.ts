import { test } from "node:test"
import assert from "node:assert/strict"
import { Redis } from "@upstash/redis"

import { createIsolatedPilotStores } from "../lib/server/quick-audit-isolated-pilot-stores"
import { AMS_PILOT_STRIPE_ACCOUNT } from "../lib/server/quick-audit-isolated-stripe-pilot"
import { RESEND_PREVIEW_BRANCH } from "../lib/server/quick-audit-resend-preview-preflight"

const env: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: RESEND_PREVIEW_BRANCH,
  AMS_STRIPE_PILOT_ACCOUNT_ID: AMS_PILOT_STRIPE_ACCOUNT,
  AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED: "true",
  AMS_STRIPE_PILOT_WEBHOOK_SECRET: "whsec_dummy_synthetic_replay_test_only",
  AMS_STRIPE_PILOT_REDIS_REST_URL: "https://separate-payment-fixture-123.upstash.io",
  AMS_STRIPE_PILOT_REDIS_REST_TOKEN: "synthetic-only",
  AMS_STRIPE_PILOT_REDIS_NAMESPACE: "ams:preview:stripe-pilot:separate-1234:",
  AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL: "https://accepted-quetzal-206056.upstash.io",
}

test("an unconfigured Preview cannot instantiate any payment, report or outbox adapter", () => {
  for (const changes of [
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED: "false" },
    { AMS_STRIPE_PILOT_REDIS_REST_TOKEN: "" },
    { AMS_STRIPE_PILOT_REDIS_REST_URL: env.AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL },
    { UPSTASH_REDIS_REST_URL: env.AMS_STRIPE_PILOT_REDIS_REST_URL },
    { AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "true" },
  ]) {
    assert.equal(createIsolatedPilotStores({ ...env, ...changes }), null)
  }
})

test("all explicitly injected adapters use a single isolated mock connection", async () => {
  const records = new Map<string, unknown>()
  let connectionsUsed = 0
  const fake = {
    async get(key: string) {
      connectionsUsed++
      return records.get(key) ?? null
    },
    async set(key: string, value: unknown) {
      connectionsUsed++
      records.set(key, value)
      return "OK"
    },
    async eval() {
      connectionsUsed++
      return 0
    },
  } as unknown as Redis
  const adapters = createIsolatedPilotStores(env, fake)
  assert.ok(adapters)
  assert.equal(adapters.eventReceipts, fake)
  assert.equal(await adapters.paymentProof.readSession("cs_test_invalid000"), null)
  assert.equal(await adapters.reports.getByRequestId("request_valid000"), null)
  const outbox = adapters.outbox
  assert.equal(await outbox.read("request_valid000"), null)
  assert.ok(connectionsUsed >= 3)
  assert.equal(records.size, 0)
})
