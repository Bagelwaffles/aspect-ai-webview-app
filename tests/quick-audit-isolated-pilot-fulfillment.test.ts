import { test } from "node:test"
import assert from "node:assert/strict"
import Stripe from "stripe"

import { fulfillIsolatedPilotCheckout } from "../lib/server/quick-audit-isolated-pilot-fulfillment"
import {
  AMS_PILOT_STRIPE_ACCOUNT,
  pilotFulfillmentConfiguration,
} from "../lib/server/quick-audit-isolated-stripe-pilot"
import { RESEND_PREVIEW_BRANCH } from "../lib/server/quick-audit-resend-preview-preflight"
import type { QuickAuditRecord, QuickAuditStore } from "../lib/server/quick-audit-fulfillment"
import type { QuickAuditAuditGateway } from "../lib/server/quick-audit-fulfillment"
import type { QuickAuditDeliveryOutbox } from "../lib/server/quick-audit-delivery-outbox"
import type { createIsolatedPilotStores } from "../lib/server/quick-audit-isolated-pilot-stores"

const owner = "owner@example.com"
const secret = "whsec_synthetic_isolated_preview_fixture_secret"
const sessionId = "cs_test_1234567890sandbox"
const eventId = "evt_1234567890sandbox"
const requestId = "request_1234567890"
const auditId = "audit_1234567890"
const priceId = "price_1234567890sandbox"
const configured: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: RESEND_PREVIEW_BRANCH,
  AMS_STRIPE_PILOT_ACCOUNT_ID: AMS_PILOT_STRIPE_ACCOUNT,
  AMS_STRIPE_PILOT_REDIS_REST_URL: "https://isolated-sandbox-payments-123.upstash.io",
  AMS_STRIPE_PILOT_REDIS_REST_TOKEN: "synthetic",
  AMS_STRIPE_PILOT_REDIS_NAMESPACE: "ams:preview:stripe-pilot:payment-1234:",
  AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL: "https://accepted-quetzal-206056.upstash.io",
  AMS_STRIPE_PILOT_FULFILLMENT_ENABLED: "true",
  AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED: "true",
  AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL: owner,
  AMS_STRIPE_PILOT_WEBHOOK_SECRET: secret,
  AMS_STRIPE_PILOT_TEST_SECRET_KEY: "sk_test_fixture_not_a_real_credential",
  AMS_STRIPE_PILOT_PRICE_ID: priceId,
}

const fixtureStripe = new Stripe("sk_test_fixture_only_for_signature_generation")
const session = {
  id: sessionId,
  livemode: false,
  mode: "payment",
  status: "complete",
  payment_status: "paid",
  metadata: {
    ams_offer: "quick-marketing-audit",
    ams_request_id: requestId,
    ams_business_name: "Example Bakery",
    ams_website_url: "https://example.com",
    ams_industry: "Bakery",
    ams_goals: "More local customers",
  },
  customer_details: { email: owner },
}
function rawEvent(change: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: eventId, object: "event", type: "checkout.session.completed",
    livemode: false,
    data: { object: { ...session } },
    ...change,
  })
}
function signed(raw: string, sig = fixtureStripe.webhooks.generateTestHeaderString({ payload: raw, secret })) {
  return new Request("https://preview.example.com/api/internal/quick-audit-stripe-pilot", {
    method: "POST",
    headers: { "stripe-signature": sig, "content-type": "application/json" },
    body: raw,
  })
}
function fixture(accountId = AMS_PILOT_STRIPE_ACCOUNT, linePrice = priceId) {
  let completed: QuickAuditRecord | null = null
  let audited = 0
  let queued = 0
  let stripeReads = 0
  const payment: QuickAuditStore = {
    async reserve(input) {
      if (completed) return { state: "duplicate", record: completed }
      return { state: "reserved", token: "synthetic-atomic-claim" }
    },
    async complete(input) {
      completed = {
        status: "completed", checkoutSessionId: input.checkoutSessionId,
        stripeEventId: input.stripeEventId, requestId: input.requestId,
        n8nAuditId: input.n8nAuditId, completedAt: input.completedAt,
      }
    },
    async release() {},
  }
  const auditGateway: QuickAuditAuditGateway = {
    async run() { audited++; return { auditId } },
  }
  const outbox = {
    async enqueue() { queued++; return {} },
  } as unknown as QuickAuditDeliveryOutbox
  const stores = { payment, auditGateway, outbox } as unknown as NonNullable<
    ReturnType<typeof createIsolatedPilotStores>
  >
  const makeStripe = () => ({
    webhooks: fixtureStripe.webhooks,
    accounts: { async retrieve() { stripeReads++; return { id: accountId } } },
    checkout: {
      sessions: {
        async retrieve() { stripeReads++; return { ...session } },
        async listLineItems() { stripeReads++; return {
          data: [{ price: { id: linePrice }, quantity: 1 }],
        } },
      },
    },
  }) as unknown as Stripe
  return {
    stores, makeStripe,
    get audited() { return audited },
    get queued() { return queued },
    get stripeReads() { return stripeReads },
  }
}

test("paid fulfillment cannot activate without independent sandbox flags and keys", () => {
  assert.equal(pilotFulfillmentConfiguration(configured).ready, true)
  for (const change of [
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { AMS_STRIPE_PILOT_ACCOUNT_ID: "acct_not_the_pilot" },
    { AMS_STRIPE_PILOT_FULFILLMENT_ENABLED: "" },
    { AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "true" },
    { AMS_QUICK_AUDIT_PILOT_DISPATCH_ENABLED: "true" },
    { AMS_STRIPE_PILOT_TEST_SECRET_KEY: "sk_live_never" },
    { AMS_STRIPE_PILOT_WEBHOOK_SECRET: "" },
    { AMS_STRIPE_PILOT_PRICE_ID: "" },
    { AMS_STRIPE_PILOT_REDIS_REST_URL: configured.AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL },
  ]) {
    assert.equal(pilotFulfillmentConfiguration({ ...configured, ...change }).ready,
      false, JSON.stringify(change))
  }
})

test("signed sandbox paid session generates one synthetic durable audit and one owner-only queue record", async () => {
  const f = fixture()
  const input = {
    env: configured, makeStripe: f.makeStripe, stores: f.stores,
    evidenceCollector: async () => ({ hasPrimaryCta: true }),
  }
  const first = await fulfillIsolatedPilotCheckout(signed(rawEvent()), input)
  const body = await first.json()
  assert.equal(first.status, 200)
  assert.equal(body.code, "QUICK_AUDIT_COMPLETED")
  assert.equal(body.ownerEmailSent, false)
  assert.equal(f.audited, 1)
  assert.equal(f.queued, 1)
  const second = await fulfillIsolatedPilotCheckout(signed(rawEvent()), input)
  assert.equal(second.status, 200)
  assert.equal((await second.json()).code, "PILOT_DUPLICATE")
  assert.equal(f.audited, 1)
  assert.equal(f.queued, 1)
})

test("previous receipt-only sandbox Checkout cannot be promoted into paid audit fulfillment", async () => {
  // This models the real, already-paid October 25 gateway receipt fixture:
  // it has no ams_offer or business/audit intake metadata. A signed receipt
  // is not independent proof that a marketing audit was ordered.
  const f = fixture()
  const receiptOnlySession = {
    ...session,
    metadata: {
      ams_preview_gate: "receipt-only",
      environment: "sandbox",
      fulfillment: "disabled",
      sandbox: "true",
      scope: "gateway-receipt",
      sending: "disabled",
    },
  }
  const json = JSON.parse(rawEvent()) as {
    data: { object: Record<string, unknown> }
  }
  json.data.object = receiptOnlySession
  const response = await fulfillIsolatedPilotCheckout(signed(JSON.stringify(json)), {
    env: configured, makeStripe: f.makeStripe, stores: f.stores,
  })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).code, "PILOT_UNRELATED_CHECKOUT_IGNORED")
  assert.equal(f.stripeReads, 0)
  assert.equal(f.audited, 0)
  assert.equal(f.queued, 0)
})

test("wrong Stripe account, invalid signature and wrong event mode fail without paid records", async () => {
  const f = fixture("acct_another_account")
  const denied = await fulfillIsolatedPilotCheckout(signed(rawEvent()), {
    env: configured, makeStripe: f.makeStripe, stores: f.stores,
  })
  assert.equal(denied.status, 503)
  assert.equal((await denied.json()).code, "PILOT_STRIPE_ACCOUNT_UNVERIFIED")
  assert.equal(f.audited, 0)
  assert.equal(f.queued, 0)
  const forged = await fulfillIsolatedPilotCheckout(signed(rawEvent(), "t=1,v1=invalid"), {
    env: configured, makeStripe: f.makeStripe, stores: f.stores,
  })
  assert.equal(forged.status, 400)
  const live = await fulfillIsolatedPilotCheckout(signed(rawEvent({ livemode: true })), {
    env: configured, makeStripe: f.makeStripe, stores: f.stores,
  })
  assert.equal(live.status, 403)
  assert.equal(f.audited, 0)
})

test("unapproved price and absent isolated storage never fulfill or send", async () => {
  const f = fixture(AMS_PILOT_STRIPE_ACCOUNT, "price_another_product")
  const res = await fulfillIsolatedPilotCheckout(signed(rawEvent()), {
    env: configured, makeStripe: f.makeStripe, stores: f.stores,
  })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).code, "UNAPPROVED_ONE_TIME_PRODUCT")
  assert.equal(f.audited, 0)
  assert.equal(f.queued, 0)
  const noStorage = await fulfillIsolatedPilotCheckout(signed(rawEvent()), {
    env: { ...configured, AMS_STRIPE_PILOT_REDIS_REST_TOKEN: "" },
    makeStripe: f.makeStripe,
  })
  assert.equal(noStorage.status, 503)
})
