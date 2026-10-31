/**
 * NON-NETWORK, NON-BILLING integration test: signed synthetic TEST checkout
 * -> independently checked sandbox order -> native report persisted ->
 * one owner-only durable outbox -> mocked Resend branded submission.
 *
 * This is NOT provider-origin acceptance, inbox delivery, or release approval.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import Stripe from "stripe"

import { fulfillIsolatedPilotCheckout } from "../lib/server/quick-audit-isolated-pilot-fulfillment"
import { AMS_PILOT_STRIPE_ACCOUNT, pilotFulfillmentConfiguration } from "../lib/server/quick-audit-isolated-stripe-pilot"
import { createNativeQuickAuditAuditGateway, type QuickAuditResultStore, type NativeQuickAuditResult } from "../lib/server/quick-audit-native"
import { QuickAuditDeliveryOutbox, type OutboxRedis } from "../lib/server/quick-audit-delivery-outbox"
import { createResendAuditSender } from "../lib/server/quick-audit-resend-sender"
import { deliverQuickAuditOwnerPreview, type PaidQuickAuditProof } from "../lib/server/quick-audit-delivery-worker"
import { AMS_RESEND_DOMAIN, AMS_RESEND_DOMAIN_ID, type ResendVerifiedDomainProof } from "../lib/server/quick-audit-resend-domain-proof"
import { RESEND_PREVIEW_BRANCH } from "../lib/server/quick-audit-resend-preview-preflight"
import type { QuickAuditRecord, QuickAuditStore } from "../lib/server/quick-audit-fulfillment"
import type { createIsolatedPilotStores } from "../lib/server/quick-audit-isolated-pilot-stores"

const owner = "owner-audit-test@example.net"
const requestId = "request_synthetic_safe_123456"
const sessionId = "cs_test_synthetic123456789"
const eventId = "evt_synthetic123456789"
const approvedPrice = "price_synthetic123456789"
const signedSecret = "whsec_synthetic_audit_loop_signing_only"
const testTime = new Date("2026-10-27T17:00:00.000Z")
const stripeClient = new Stripe("sk_test_synthetic_only_no_network")
const env: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: RESEND_PREVIEW_BRANCH,
  AMS_STRIPE_PILOT_ACCOUNT_ID: AMS_PILOT_STRIPE_ACCOUNT,
  AMS_STRIPE_PILOT_REDIS_REST_URL: "https://isolated-synthetic-fixture-123.upstash.io",
  AMS_STRIPE_PILOT_REDIS_REST_TOKEN: "never-a-real-token",
  AMS_STRIPE_PILOT_REDIS_NAMESPACE: "ams:preview:stripe-pilot:fixture-only:",
  AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL: "https://accepted-quetzal-206056.upstash.io",
  AMS_STRIPE_PILOT_FULFILLMENT_ENABLED: "true",
  AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED: "true",
  AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL: owner,
  AMS_STRIPE_PILOT_WEBHOOK_SECRET: signedSecret,
  AMS_STRIPE_PILOT_TEST_SECRET_KEY: "sk_test_synthetic_only_no_network",
  AMS_STRIPE_PILOT_PRICE_ID: approvedPrice,
}
const session = {
  id: sessionId,
  object: "checkout.session",
  livemode: false,
  mode: "payment",
  status: "complete",
  payment_status: "paid",
  amount_total: 4900,
  currency: "usd",
  // Intentionally past: a completed, settled session must survive a webhook delay.
  expires_at: 1,
  metadata: {
    ams_offer: "quick-marketing-audit",
    ams_request_id: requestId,
    ams_business_name: "Synthetic Florist Fixture",
    ams_website_url: "https://example.com",
    ams_industry: "Florist",
    ams_goals: "More quote requests",
  },
  customer_details: { email: owner },
}

function signedRequest() {
  const raw = JSON.stringify({
    id: eventId, object: "event", type: "checkout.session.completed",
    livemode: false, data: { object: session },
  })
  return new Request("https://preview.example.com/api/internal/quick-audit-stripe-pilot", {
    method: "POST",
    headers: {
      "stripe-signature": stripeClient.webhooks.generateTestHeaderString({
        payload: raw, secret: signedSecret, timestamp: Math.floor(Date.now() / 1000),
      }),
      "content-type": "application/json",
    },
    body: raw,
  })
}

function createFixtures() {
  const payments = new Map<string, QuickAuditRecord>()
  let reportsSaved = 0
  let auditAttempts = 0
  let stripeReadCount = 0
  const results = new Map<string, NativeQuickAuditResult>()
  const records = new Map<string, string>()
  const reportStore: QuickAuditResultStore = {
    async getByRequestId(id) { return results.get(id) ?? null },
    async save(result) { reportsSaved++; results.set(result.requestId, result) },
  }
  const redis: OutboxRedis = {
    async get(key) { return (records.get(key) ?? null) as never },
    async set(key, value, options) {
      if (options.nx && records.has(key)) return null
      records.set(key, value)
      return "OK"
    },
    async eval(_script, keys, args) {
      if (records.get(keys[0]) !== args[0]) return 0
      records.set(keys[0], args[1])
      return 1
    },
  }
  const outbox = new QuickAuditDeliveryOutbox(redis)
  const native = createNativeQuickAuditAuditGateway({ store: reportStore, now: () => testTime })
  const auditGateway = {
    async run(input: Parameters<typeof native.run>[0]) {
      auditAttempts++
      return native.run(input)
    },
  }
  const paymentStore: QuickAuditStore = {
    async reserve(input) {
      const old = payments.get(input.checkoutSessionId)
      if (old) return old.requestId === input.requestId
        ? { state: "duplicate", record: old } as const
        : { state: "conflict" } as const
      return { state: "reserved", token: "synthetic-claim-123" } as const
    },
    async complete(input) {
      const { token: _token, ...stored } = input
      payments.set(input.checkoutSessionId, stored)
    },
    async release() {},
  }
  const stores = {
    payment: paymentStore,
    auditGateway,
    outbox,
  } as unknown as NonNullable<ReturnType<typeof createIsolatedPilotStores>>
  const makeStripe = () => ({
    webhooks: stripeClient.webhooks,
    accounts: { async retrieve() { stripeReadCount++; return { id: AMS_PILOT_STRIPE_ACCOUNT } } },
    checkout: { sessions: {
      async retrieve() { stripeReadCount++; return session },
      async listLineItems() {
        stripeReadCount++
        return { data: [{ price: { id: approvedPrice }, quantity: 1 }], has_more: false }
      },
    } },
  }) as unknown as Stripe
  const proof: PaidQuickAuditProof = {
    async readSession(id) {
      const record = payments.get(id)
      return record ? {
        status: "completed",
        checkoutSessionId: record.checkoutSessionId,
        requestId: record.requestId,
        n8nAuditId: record.n8nAuditId,
      } : null
    },
  }
  return {
    env, outbox, reportStore, proof, stores, makeStripe, payments, results,
    get reportsSaved() { return reportsSaved },
    get auditAttempts() { return auditAttempts },
    get stripeReadCount() { return stripeReadCount },
  }
}

test("synthetic signed paid checkout generates exactly one native audit, one durable outbox, and one mocked branded Resend submission", async () => {
  const f = createFixtures()
  assert.equal(pilotFulfillmentConfiguration(f.env).ready, true, "Synthetic TEST fixture must pass all isolated-fulfillment guards")
  const first = await fulfillIsolatedPilotCheckout(signedRequest(), {
    env: f.env, stores: f.stores, makeStripe: f.makeStripe,
    evidenceCollector: async () => ({ hasPrimaryCta: false, hasContactInfo: true }),
  })
  assert.equal(first.status, 200)
  assert.equal((await first.json()).code, "QUICK_AUDIT_COMPLETED")
  const saved = f.results.get(requestId)
  assert.ok(saved)
  assert.equal(saved.version, "native-v1")
  assert.equal(saved.businessName, "Synthetic Florist Fixture")
  assert.equal(saved.findings.length, 5)
  assert.equal(saved.sevenDayPlan.length, 7)
  assert.equal(f.payments.get(sessionId)?.n8nAuditId, saved.auditId)
  assert.equal((await f.outbox.read(requestId))?.state, "queued")
  assert.equal(f.reportsSaved, 1)

  const replay = await fulfillIsolatedPilotCheckout(signedRequest(), {
    env: f.env, stores: f.stores, makeStripe: f.makeStripe,
    evidenceCollector: async () => { throw Error("Duplicate should never inspect website") },
  })
  assert.equal((await replay.json()).code, "PILOT_DUPLICATE")
  assert.equal(f.auditAttempts, 1)
  assert.equal(f.reportsSaved, 1)

  const sent: Array<{ from: string; to: string[]; reply_to: string; text: string }> = []
  const proof: ResendVerifiedDomainProof = {
    domainId: AMS_RESEND_DOMAIN_ID, domainName: AMS_RESEND_DOMAIN,
    status: "verified", sending: "enabled", source: "resend-domain-api",
    verifiedAt: testTime.toISOString(),
  }
  const sendEnv: NodeJS.ProcessEnv = {
    ...f.env, AMS_STRIPE_PILOT_FULFILLMENT_ENABLED: "false",
    AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "true",
    AMS_RESEND_SEND_API_KEY: "synthetic-sending-only-token",
    AMS_RESEND_DOMAIN_ID,
  }
  const sender = createResendAuditSender({
    env: sendEnv, now: () => testTime, readDomainProof: async () => proof,
    fetcher: async (url, init) => {
      assert.equal(String(url), "https://api.resend.com/emails")
      const body = JSON.parse(String(init?.body))
      sent.push(body)
      return Response.json({ id: "11111111-2222-4333-8444-555555555555" })
    },
  })
  const delivery = {
    env: sendEnv, requestId, outbox: f.outbox, proof: f.proof,
    reports: f.reportStore, sender,
  }
  assert.deepEqual(await deliverQuickAuditOwnerPreview(delivery), { status: "submitted" })
  assert.equal(sent.length, 1)
  assert.deepEqual(sent[0].to, [owner])
  assert.equal(sent[0].from, "Aspect Marketing Solutions <kimberley@aspectmarketingsolutions.app>")
  assert.equal(sent[0].reply_to, "kimberley@aspectmarketingsolutions.app")
  assert.match(sent[0].text, /FIVE PRIORITY FINDINGS AND RECOMMENDED FIXES/u)
  assert.match(sent[0].text, /Day 7:/u)
  assert.equal((await f.outbox.read(requestId))?.state, "submitted")
  assert.deepEqual(await deliverQuickAuditOwnerPreview(delivery), { status: "duplicate" })
  assert.equal(sent.length, 1)
  // A mocked provider acceptance is not independent real inbox delivery.
  assert.notEqual((await f.outbox.read(requestId))?.state, "delivered")
})
