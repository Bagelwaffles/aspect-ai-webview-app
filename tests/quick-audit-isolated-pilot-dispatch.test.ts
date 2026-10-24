import { test } from "node:test"
import assert from "node:assert/strict"
import { Redis } from "@upstash/redis"

import {
  pilotDispatchConfiguration,
  AMS_PILOT_STRIPE_ACCOUNT,
} from "../lib/server/quick-audit-isolated-stripe-pilot"
import { createIsolatedPilotStores } from "../lib/server/quick-audit-isolated-pilot-stores"
import { RESEND_PREVIEW_BRANCH } from "../lib/server/quick-audit-resend-preview-preflight"

const safe: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: RESEND_PREVIEW_BRANCH,
  AMS_STRIPE_PILOT_ACCOUNT_ID: AMS_PILOT_STRIPE_ACCOUNT,
  AMS_STRIPE_PILOT_REDIS_REST_URL: "https://independent-isolated-payments-123.upstash.io",
  AMS_STRIPE_PILOT_REDIS_REST_TOKEN: "synthetic-only",
  AMS_STRIPE_PILOT_REDIS_NAMESPACE: "ams:preview:stripe-pilot:isolated-dispatch:",
  AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL: "https://accepted-quetzal-206056.upstash.io",
  AMS_STRIPE_PILOT_FULFILLMENT_ENABLED: "true",
  AMS_QUICK_AUDIT_PILOT_DISPATCH_ENABLED: "true",
  AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "true",
  AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL: "owner@example.com",
}

test("manual owner dispatch is disabled until all independent switches and isolated datastore are configured", () => {
  assert.equal(pilotDispatchConfiguration(safe).ready, true)
  for (const change of [
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { AMS_STRIPE_PILOT_ACCOUNT_ID: "acct_other" },
    { AMS_STRIPE_PILOT_FULFILLMENT_ENABLED: "false" },
    { AMS_QUICK_AUDIT_PILOT_DISPATCH_ENABLED: "" },
    { AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "false" },
    { AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL: "" },
    { AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL: "not-an-email" },
    { AMS_STRIPE_PILOT_REDIS_REST_TOKEN: "" },
    { AMS_STRIPE_PILOT_REDIS_REST_URL: safe.AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL },
    { UPSTASH_REDIS_REST_URL: safe.AMS_STRIPE_PILOT_REDIS_REST_URL },
  ]) {
    assert.equal(pilotDispatchConfiguration({ ...safe, ...change }).ready, false, JSON.stringify(change))
  }
})

test("dispatch mode injects the same separate DB but never sends or reads without a caller", async () => {
  const commands: string[] = []
  const stub = {
    async get(key: string) {
      commands.push("GET " + key)
      return null
    },
    async set(key: string) {
      commands.push("SET " + key)
      return "OK"
    },
    async eval() {
      commands.push("EVAL")
      return 0
    },
  } as unknown as Redis
  assert.equal(createIsolatedPilotStores({
    ...safe, AMS_QUICK_AUDIT_PILOT_DISPATCH_ENABLED: "false",
  }, stub, "dispatch"), null)
  const adapters = createIsolatedPilotStores(safe, stub, "dispatch")
  assert.ok(adapters)
  assert.equal(adapters.eventReceipts, stub)
  assert.deepEqual(commands, [])
  assert.equal(await adapters.outbox.read("request_12345678"), null)
  assert.deepEqual(commands, ["GET ams:quick-audit:delivery:request_12345678"])
})
