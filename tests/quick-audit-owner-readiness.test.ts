import assert from "node:assert/strict"
import test from "node:test"

import { NextRequest } from "next/server"

import {
  createAuditOwnerPilotReadinessHandler,
  inspectAuditOwnerPilotConfiguration,
} from "../lib/server/quick-audit-owner-readiness"

const configured = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  AMS_OWNER_EMAIL: "owner@example.com",
  AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL: "owner@example.com",
  INTERNAL_ADMIN_SECRET: "a-private-integration-test-secret-32chars",
  GOOGLE_CLIENT_ID: "test-app-client",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  NEXTAUTH_SECRET: "test-nextauth-secret",
  AMS_STRIPE_QUICK_AUDIT_SECRET_KEY: "sk_test_mock_key",
  AMS_STRIPE_QUICK_AUDIT_PRICE_ID: "price_test_mock",
  AMS_QUICK_AUDIT_OWNER_PILOT_COUPON_ID: "coupon_test_mock",
  AMS_STRIPE_QUICK_AUDIT_WEBHOOK_SECRET: "whsec_fixture",
  UPSTASH_REDIS_REST_URL: "https://redis-fixture.example",
  UPSTASH_REDIS_REST_TOKEN: "dont-emit-fixture",
  AMS_QUICK_AUDIT_FULFILLMENT_READY: "true",
  AMS_QUICK_AUDIT_OWNER_PILOT_ENABLED: "true",
} as NodeJS.ProcessEnv

const request = () => new NextRequest("https://preview.example/api/internal/quick-audit/owner-pilot/readiness")

test("pilot readiness reports all necessary configuration gates, never token values", async () => {
  const handler = createAuditOwnerPilotReadinessHandler({
    env: configured,
    verifyOwner: async () => "owner@example.com",
  })
  const res = await handler(request())
  const body = await res.json()
  assert.equal(res.status, 200)
  assert.equal(res.headers.get("cache-control"), "no-store")
  assert.equal(body.readyForConfigurationReview, true)
  assert.equal(body.gates.length, 7)
  assert.equal(body.gates.every((gate: { configured: boolean }) => gate.configured), true)
  assert.equal(JSON.stringify(body).includes("dont-emit-fixture"), false)
  assert.equal(JSON.stringify(body).includes("test-client-secret"), false)
  assert.equal(JSON.stringify(body).includes("owner@example.com"), false)
})

test("production and unauthorized callers receive no gate metadata", async () => {
  for (const options of [
    { env: { ...configured, VERCEL_ENV: "production" }, verifyOwner: async () => "owner@example.com", status: 404 },
    { env: configured, verifyOwner: async () => "other@example.com", status: 403 },
    { env: configured, verifyOwner: async () => null, status: 403 },
    { env: { ...configured, AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL: "" }, verifyOwner: async () => "owner@example.com", status: 403 },
  ]) {
    const handler = createAuditOwnerPilotReadinessHandler(options)
    const result = await handler(request())
    assert.equal(result.status, options.status)
    assert.equal(JSON.stringify(await result.json()).includes("gates"), false)
  }
})

test("missing preview OAuth, webhook, Redis, or flags fail closed", () => {
  for (const [key, gate] of [
    ["GOOGLE_CLIENT_SECRET", "owner"],
    ["AMS_STRIPE_QUICK_AUDIT_SECRET_KEY", "stripe"],
    ["AMS_STRIPE_QUICK_AUDIT_WEBHOOK_SECRET", "webhook"],
    ["UPSTASH_REDIS_REST_TOKEN", "storage"],
    ["AMS_QUICK_AUDIT_FULFILLMENT_READY", "fulfillment"],
    ["AMS_QUICK_AUDIT_OWNER_PILOT_ENABLED", "checkout"],
  ]) {
    const values = { ...configured, [key]: "" } as NodeJS.ProcessEnv
    const gateRecord = inspectAuditOwnerPilotConfiguration(values).find(g => g.id === gate)
    assert.equal(gateRecord?.configured, false, `${key} should fail the ${gate} gate`)
  }
})

test("test Stripe key must not be live and owner allowlists must match", () => {
  for (const env of [
    { ...configured, AMS_STRIPE_QUICK_AUDIT_SECRET_KEY: "sk_live_wrong" },
    { ...configured, AMS_OWNER_EMAIL: "not-the-owner@example.com" },
  ]) {
    const gates = inspectAuditOwnerPilotConfiguration(env as NodeJS.ProcessEnv)
    assert.equal(gates.every(g => g.configured), false)
  }
})
