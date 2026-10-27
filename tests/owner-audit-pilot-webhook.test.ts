import assert from "node:assert/strict"
import test from "node:test"
import type Stripe from "stripe"
import { NextRequest } from "next/server"
import { isSignedOwnerAuditPilotEvent, ownerPilotWebhookIntakeReady, ownerAuditPilotWebhookPOST } from "../lib/server/owner-audit-pilot-webhook"

const url = "https://aspect-ai-overlord-git-e240cd-kimberleyaversbiz-4131s-projects.vercel.app/api/internal/quick-audit-pilot/webhook"
const base: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feat/audit-delivery-security-preview-20261023",
  AMS_QUICK_AUDIT_OWNER_PILOT_REDIS_REST_URL: "https://pretty-crab-239388.upstash.io",
  AMS_QUICK_AUDIT_OWNER_PILOT_REDIS_REST_TOKEN: "test-only-fixture",
  AMS_QUICK_AUDIT_OWNER_PILOT_WEBHOOK_INTAKE_ENABLED: "true",
  AMS_QUICK_AUDIT_OWNER_PILOT_WEBHOOK_INTAKE_UNTIL: "2026-10-26T21:05:00.000Z",
  AMS_STRIPE_WEBHOOK_MODE: "test", AMS_STRIPE_QUICK_AUDIT_SECRET_KEY: "sk_test_fake",
  AMS_STRIPE_QUICK_AUDIT_WEBHOOK_SECRET: "whsec_fake",
  AMS_STRIPE_QUICK_AUDIT_PRICE_ID: "price_1U47ZwGloGM6sjzB3awn1s2A",
}
const now = Date.parse("2026-10-26T21:00:00.000Z")

test("pilot intake is OFF by default and never accepts production or wrong Preview branch", async () => {
  assert.equal(ownerPilotWebhookIntakeReady({ NODE_ENV: "test" }, url, now), false)
  assert.equal(ownerPilotWebhookIntakeReady({ ...base, VERCEL_ENV: "production" }, url, now), false)
  assert.equal(ownerPilotWebhookIntakeReady({ ...base, VERCEL_GIT_COMMIT_REF: "main" }, url, now), false)
  assert.equal(ownerPilotWebhookIntakeReady({ ...base, AMS_QUICK_AUDIT_OWNER_PILOT_WEBHOOK_INTAKE_ENABLED: "false" }, url, now), false)
  assert.equal(ownerPilotWebhookIntakeReady(base, url, now), true)
  const request = new NextRequest(url, { method: "POST", body: "{}", headers: { "stripe-signature": "bogus" } })
  const response = await ownerAuditPilotWebhookPOST(request, { ...base, AMS_QUICK_AUDIT_OWNER_PILOT_WEBHOOK_INTAKE_ENABLED: "false" })
  assert.equal(response.status, 503)
  assert.equal((await response.json()).code, "PILOT_WEBHOOK_INTAKE_DISABLED")
})

test("pilot intake refuses non-isolated Redis, live credentials, mail and public enrollment", () => {
  const cases: Array<Partial<NodeJS.ProcessEnv>> = [
    { AMS_QUICK_AUDIT_OWNER_PILOT_REDIS_REST_URL: "https://internal-chicken-238070.upstash.io" },
    { AMS_QUICK_AUDIT_OWNER_PILOT_REDIS_REST_URL: "https://pretty-crab-239388.upstash.io:80" },
    { AMS_QUICK_AUDIT_OWNER_PILOT_REDIS_REST_URL: "http://pretty-crab-239388.upstash.io" },
    { AMS_QUICK_AUDIT_OWNER_PILOT_REDIS_REST_TOKEN: "" },
    { AMS_STRIPE_QUICK_AUDIT_SECRET_KEY: "sk_live_wrong" },
    { AMS_STRIPE_WEBHOOK_MODE: "live" },
    { AMS_STRIPE_QUICK_AUDIT_PRICE_ID: "price_wrong" },
    { AMS_QUICK_AUDIT_PUBLIC_SALES_ENABLED: "true" },
    { AMS_SUBSCRIPTION_CHECKOUT_ENABLED: "true" },
    { AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED: "true" },
    { AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "true" },
  ]
  for (const changed of cases) assert.equal(ownerPilotWebhookIntakeReady({ ...base, ...changed }, url, now), false)
  assert.equal(ownerPilotWebhookIntakeReady(base, "https://www.aspectmarketingsolutions.app/api/internal/quick-audit-pilot/webhook", now), false)
  assert.equal(ownerPilotWebhookIntakeReady(base, url.replace("/webhook", "/other"), now), false)
})

test("pilot intake requires a valid short-lived UTC window and expires closed", () => {
  assert.equal(ownerPilotWebhookIntakeReady(base, url, now + 6 * 60 * 1000), false)
  assert.equal(ownerPilotWebhookIntakeReady(base, url, now - 8 * 60 * 1000), false)
  assert.equal(ownerPilotWebhookIntakeReady({ ...base, AMS_QUICK_AUDIT_OWNER_PILOT_WEBHOOK_INTAKE_UNTIL: "invalid" }, url, now), false)
  assert.equal(ownerPilotWebhookIntakeReady({ ...base, AMS_QUICK_AUDIT_OWNER_PILOT_WEBHOOK_INTAKE_UNTIL: "2026-10-26T21:30:00.000Z" }, url, now), false)
})

test("pilot event filter refuses non-pilot, other account, live and wrong session", () => {
  const event = {
    livemode: false, type: "checkout.session.completed",
    data: { object: { id: "cs_test_owner", mode: "payment", metadata: {
      ams_offer: "quick-marketing-audit", ams_environment: "test-five-dollar-pilot",
      ams_request_id: "quick-audit-owner-five-dollar-20261026",
    } } },
  } as unknown as Stripe.Event
  assert.equal(isSignedOwnerAuditPilotEvent(event), true)
  assert.equal(isSignedOwnerAuditPilotEvent({ ...event, livemode: true }), false)
  assert.equal(isSignedOwnerAuditPilotEvent({ ...event, account: "acct_other" }), false)
  assert.equal(isSignedOwnerAuditPilotEvent({ ...event, type: "invoice.paid" } as unknown as Stripe.Event), false)
  assert.equal(isSignedOwnerAuditPilotEvent({ ...event, data: { object: { id: "cs_test_owner", mode: "payment", metadata: {} } } } as Stripe.Event), false)
})
