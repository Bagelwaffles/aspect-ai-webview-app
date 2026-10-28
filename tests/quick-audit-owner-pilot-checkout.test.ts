import { test } from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"
import type Stripe from "stripe"
import { createOwnerPilotTestCheckoutHandler, ownerPilotCheckoutReadiness } from "../lib/server/quick-audit-owner-pilot-checkout"
import { AMS_PILOT_STRIPE_ACCOUNT } from "../lib/server/quick-audit-isolated-stripe-pilot"
import { RESEND_PREVIEW_BRANCH } from "../lib/server/quick-audit-resend-preview-preflight"

const origin = "https://aspect-ai-overlord-git-isolated-test.vercel.app"
const now = Date.parse("2026-10-27T21:00:00Z")
const owner = "owner@example.com"
const priceId = "price_1UTu1FGuhFCl8JHacYf5y5BL"
const auditProductId = "prod_VUtosNXroc0LoZ"
const valid: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: RESEND_PREVIEW_BRANCH,
  AMS_STRIPE_PILOT_ACCOUNT_ID: AMS_PILOT_STRIPE_ACCOUNT,
  AMS_STRIPE_PILOT_REDIS_REST_URL: "https://isolated-test-pilot-1234.upstash.io",
  AMS_STRIPE_PILOT_REDIS_REST_TOKEN: "synthetic-only",
  AMS_STRIPE_PILOT_REDIS_NAMESPACE: "ams:preview:stripe-pilot:owner-test-1234:",
  AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL: "https://accepted-quetzal-206056.upstash.io",
  AMS_STRIPE_PILOT_FULFILLMENT_ENABLED: "true",
  AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED: "true",
  AMS_QUICK_AUDIT_PILOT_DISPATCH_ENABLED: "false",
  AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "false",
  AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED: "false",
  AMS_STRIPE_PILOT_TEST_SECRET_KEY: "sk_test_synthetic_only",
  AMS_STRIPE_PILOT_WEBHOOK_SECRET: "whsec_synthetic_owner_test_checkout",
  AMS_STRIPE_PILOT_PRICE_ID: priceId,
  AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL: owner,
  AMS_OWNER_EMAIL: owner,
  AMS_STRIPE_PILOT_CHECKOUT_ENABLED: "true",
  AMS_STRIPE_PILOT_CHECKOUT_RUN_ID: "owner-acceptance-run-20261027",
  AMS_STRIPE_PILOT_CHECKOUT_UNTIL: "2026-10-27T21:05:00Z",
  PUBLIC_APP_URL: origin,
  NEXTAUTH_URL: origin,
}

function request(body: string = '{"confirm":"CREATE_ONE_STRIPE_TEST_CHECKOUT"}') {
  return new NextRequest(origin + "/api/internal/quick-audit-owner-pilot-checkout", {
    method: "POST", headers: { "content-type": "application/json", origin },
    body,
  })
}
function fixture(overrides: Partial<NodeJS.ProcessEnv> = {}, opts: {
  account?: string; amount?: number; live?: boolean; priceActive?: boolean;
  productId?: string; returnedPriceId?: string;
  sessionId?: string; sessionUrl?: string;
} = {}) {
  const events: string[] = []
  const made: Array<{ params: Stripe.Checkout.SessionCreateParams; idempotency?: string }> = []
  const makeStripe = () => ({
    accounts: {
      retrieve: async () => { events.push("account-read"); return { id: opts.account ?? AMS_PILOT_STRIPE_ACCOUNT } },
    },
    prices: {
      retrieve: async (id: string) => {
        events.push("price-read:" + id)
        return { id: opts.returnedPriceId ?? priceId, product: opts.productId ?? auditProductId,
          livemode: opts.live ?? false, active: opts.priceActive ?? true,
          unit_amount: opts.amount ?? 4900, currency: "usd", type: "one_time", recurring: null }
      },
    },
    checkout: {
      sessions: {
        create: async (params: Stripe.Checkout.SessionCreateParams, options: Stripe.RequestOptions) => {
          events.push("session-create")
          made.push({ params, idempotency: options.idempotencyKey })
          return { id: opts.sessionId ?? "cs_test_1234567890fixture", livemode: false,
            url: opts.sessionUrl ?? "https://checkout.stripe.com/c/pay/cs_test_1234567890fixture" }
        },
      },
    },
  }) as unknown as Stripe
  const env = { ...valid, ...overrides }
  const handler = createOwnerPilotTestCheckoutHandler({
    env, now: () => now, authorize: async () => true, makeStripe,
  })
  return { handler, events, made, env }
}

test("fail-closed test checkout requires valid isolated sandbox identity and a <=10-minute owner window", () => {
  assert.equal(ownerPilotCheckoutReadiness(valid, now), true)
  for (const change of [
    { VERCEL_ENV: "production" }, { VERCEL_GIT_COMMIT_REF: "main" },
    { AMS_STRIPE_PILOT_ACCOUNT_ID: "acct_wrong_account" },
    { AMS_STRIPE_PILOT_REDIS_REST_URL: valid.AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL },
    { AMS_STRIPE_PILOT_CHECKOUT_ENABLED: "false" },
    { AMS_STRIPE_PILOT_CHECKOUT_RUN_ID: "" },
    { AMS_STRIPE_PILOT_CHECKOUT_UNTIL: "2026-10-27T20:59:59Z" },
    { AMS_STRIPE_PILOT_CHECKOUT_UNTIL: "2026-10-27T21:11:00Z" },
    { AMS_STRIPE_PILOT_FULFILLMENT_ENABLED: "false" },
    { AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED: "false" },
    { AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "true" },
    { AMS_QUICK_AUDIT_PILOT_DISPATCH_ENABLED: "true" },
    { AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED: "true" },
    { AMS_OWNER_EMAIL: "somebody@example.org" },
    { PUBLIC_APP_URL: "https://www.aspectmarketingsolutions.app" },
    { NEXTAUTH_URL: "https://different-preview.vercel.app" },
    { AMS_STRIPE_PILOT_TEST_SECRET_KEY: "sk_live_denied" },
  ]) {
    assert.equal(ownerPilotCheckoutReadiness({ ...valid, ...change }, now), false, JSON.stringify(change))
  }
})

test("unauthorized, closed, malformed and unsolicited requests never call Stripe", async () => {
  const f = fixture()
  const unauthorized = createOwnerPilotTestCheckoutHandler({
    env: valid, now: () => now, authorize: async () => false, makeStripe: () => {
      throw Error("Stripe must never be called")
    },
  })
  assert.equal((await unauthorized(request())).status, 401)
  assert.equal((await fixture({ AMS_STRIPE_PILOT_CHECKOUT_ENABLED: "false" }).handler(request())).status, 503)
  assert.equal((await f.handler(request('{}'))).status, 400)
  assert.equal((await f.handler(request('{"confirm":"CREATE_ONE_STRIPE_TEST_CHECKOUT","recipient":"other@example.net"}'))).status, 400)
  assert.deepEqual(f.events, [])
})

test("owner-created TEST session carries exact audit metadata and deterministic one-run idempotency", async () => {
  const f = fixture()
  const first = await f.handler(request())
  assert.equal(first.status, 200)
  const data = await first.json()
  assert.equal(data.code, "PILOT_TEST_CHECKOUT_CREATED")
  assert.equal(data.paymentPerformed, false)
  assert.equal(data.emailSent, false)
  assert.equal(data.sessionId, "cs_test_1234567890fixture")
  assert.equal(f.made.length, 1)
  const entry = f.made[0]
  assert.equal(entry.params.mode, "payment")
  assert.equal(entry.params.payment_method_types, undefined, "Stripe Dashboard controls available TEST payment methods")
  assert.equal(entry.params.customer_email, owner)
  assert.equal(entry.params.line_items?.[0]?.price, priceId)
  assert.equal(entry.params.allow_promotion_codes, false)
  assert.equal(entry.params.metadata?.ams_offer, "quick-marketing-audit")
  assert.equal(entry.params.metadata?.ams_preview_run_id, valid.AMS_STRIPE_PILOT_CHECKOUT_RUN_ID)
  assert.equal(entry.params.metadata?.ams_business_name, "Aspect Marketing Solutions")
  assert.equal(entry.params.metadata?.ams_website_url, "https://www.aspectmarketingsolutions.app")
  assert.ok(String(entry.params.metadata?.ams_request_id ?? "").startsWith("quick-audit-"))
  assert.equal(entry.params.success_url?.startsWith(origin), true)
  assert.match(entry.idempotency ?? "", /^ams-pilot-checkout-[a-f0-9]{64}$/)
  assert.deepEqual(f.events, ["account-read", "price-read:" + priceId, "session-create"])
  const second = await f.handler(request())
  assert.equal(second.status, 200)
  assert.equal(f.made[1].idempotency, entry.idempotency)
  assert.equal(f.made[1].params.metadata?.ams_request_id, entry.params.metadata?.ams_request_id)
})

test("wrong sandbox account, non-$49 price or wrong returned session fail without new payment", async () => {
  for (const opt of [
    { account: "acct_wrong123" }, { amount: 500 }, { live: true },
    { priceActive: false },
    { productId: "prod_VWJuXWa7oBNid9" }, // Real, equal-priced 300-credit pack
    { returnedPriceId: "price_1UVHGYGuhFCl8JHaa9ou0jb6" },
  ]) {
    const f = fixture({}, opt)
    const response = await f.handler(request())
    assert.equal(response.status, 503)
    assert.equal(f.events.includes("session-create"), false)
  }
  for (const opt of [
    { sessionId: "cs_live_1234567890forbidden" },
    { sessionUrl: "https://danger.example.com/checkout" },
  ]) {
    const f = fixture({}, opt)
    assert.equal((await f.handler(request())).status, 503)
  }
})
