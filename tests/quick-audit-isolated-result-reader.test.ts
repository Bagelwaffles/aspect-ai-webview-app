import assert from "node:assert/strict"
import test from "node:test"

import { NextRequest } from "next/server"
import type Stripe from "stripe"

import { buildNativeQuickAuditResult, type NativeQuickAuditResult, type QuickAuditResultStore } from "../lib/server/quick-audit-native"
import { createIsolatedPilotBuyerResultHandler } from "../lib/server/quick-audit-isolated-result-reader"
import { createBuyerReportAccessToken } from "../lib/server/quick-audit-report-access"
import { AMS_PILOT_STRIPE_ACCOUNT } from "../lib/server/quick-audit-isolated-stripe-pilot"
import { RESEND_PREVIEW_BRANCH, RESEND_PREVIEW_REDIS_HOST } from "../lib/server/quick-audit-resend-preview-preflight"

const sessionId = "cs_test_previewbuyer12345"
const requestId = "quick-audit-previewreader12345"
const priceId = "price_previewAudit12345"
const email = "buyer@example.com"
const signingSecret = "synthetic-buyer-link-secret-at-least-32-characters"
const report = buildNativeQuickAuditResult({
  businessName: "Example Buyer",
  websiteUrl: "https://example.com",
  industry: "Services",
  goals: "Improve leads",
  notes: "",
  requestId,
  evidence: { hasPrimaryCta: false },
})

const safeEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: RESEND_PREVIEW_BRANCH,
  AMS_QUICK_AUDIT_PILOT_BUYER_RESULT_ENABLED: "true",
  AMS_QUICK_AUDIT_REPORT_ACCESS_REQUIRED: "true",
  AMS_QUICK_AUDIT_REPORT_ACCESS_SECRET: signingSecret,
  AMS_STRIPE_PILOT_ACCOUNT_ID: AMS_PILOT_STRIPE_ACCOUNT,
  AMS_STRIPE_PILOT_TEST_SECRET_KEY: "sk_test_synthetic_reader_fixture",
  AMS_STRIPE_PILOT_PRICE_ID: priceId,
  AMS_STRIPE_PILOT_REDIS_REST_URL: "https://separate-sandbox-reader-12345.upstash.io",
  AMS_STRIPE_PILOT_REDIS_REST_TOKEN: "fake-isolated-token",
  AMS_STRIPE_PILOT_REDIS_NAMESPACE: "ams:preview:stripe-pilot:reader-fixture:",
  AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL: "https://" + RESEND_PREVIEW_REDIS_HOST,
}
const validUrl = "https://ams.example/api/quick-marketing-audit/result?session_id=" + sessionId
const now = Date.now()

function fixture(overrides: {
  env?: NodeJS.ProcessEnv
  accountId?: string
  buyerEmail?: string
  storedReport?: NativeQuickAuditResult | null
} = {}) {
  let stripeReads = 0
  let storeReads = 0
  const env = overrides.env ?? { ...safeEnv }
  const stripe = {
    accounts: { retrieve: async () => {
      stripeReads += 1
      return { id: overrides.accountId ?? AMS_PILOT_STRIPE_ACCOUNT }
    } },
    checkout: { sessions: {
      retrieve: async () => {
        stripeReads += 1
        return {
          id: sessionId,
          livemode: false,
          mode: "payment",
          status: "complete",
          payment_status: "paid",
          customer_details: { email: overrides.buyerEmail ?? email },
          metadata: { ams_offer: "quick-marketing-audit", ams_request_id: requestId },
        } as unknown as Stripe.Checkout.Session
      },
      listLineItems: async () => {
        stripeReads += 1
        return { object: "list", data: [{ price: { id: priceId }, quantity: 1 }], has_more: false }
      },
    } },
  } as unknown as Stripe
  const store: QuickAuditResultStore = {
    getByRequestId: async () => {
      storeReads += 1
      return overrides.storedReport === undefined ? report : overrides.storedReport
    },
    save: async () => { throw Error("TEST_READER_SHOULD_NOT_WRITE") },
  }
  const handler = createIsolatedPilotBuyerResultHandler({
    env,
    makeStripe: () => stripe,
    makeStore: () => store,
  })
  return { handler, reads: () => ({ stripeReads, storeReads }) }
}
function request(token?: string) {
  return new NextRequest(validUrl, token ? { headers: { authorization: "Bearer " + token } } : undefined)
}
const token = createBuyerReportAccessToken({ checkoutSessionId: sessionId, requestId, buyerEmail: email }, signingSecret, now)

test("isolated Preview reader requires Stripe payment and buyer token for the saved report", async () => {
  const f = fixture()
  const denied = await f.handler(request())
  assert.equal(denied?.status, 403)
  assert.equal((await denied?.json())?.code, "QUICK_AUDIT_REPORT_ACCESS_REQUIRED")
  const accepted = await f.handler(request(token))
  assert.equal(accepted?.status, 200)
  assert.equal((await accepted?.json())?.result.auditId, report.auditId)
  assert.equal(accepted?.headers.get("cache-control"), "no-store")
  assert.equal(accepted?.headers.get("referrer-policy"), "no-referrer")
})

test("isolated reader rejects signed token for another Stripe buyer and wrong stored result", async () => {
  const wrongBuyer = fixture({ buyerEmail: "wrong@example.com" })
  assert.equal((await wrongBuyer.handler(request(token)))?.status, 403)
  const wrongResult = fixture({ storedReport: { ...report, requestId: "quick-audit-otherbuyer" } })
  assert.equal((await wrongResult.handler(request(token)))?.status, 403)
})

test("isolated reader verifies actual pilot account independently before any report read", async () => {
  const f = fixture({ accountId: "acct_other_synthetic" })
  const response = await f.handler(request(token))
  assert.equal(response?.status, 503)
  assert.equal((await response?.json())?.code, "PILOT_BUYER_ACCOUNT_UNVERIFIED")
  assert.equal(f.reads().storeReads, 0)
})

test("reader is invisible when pilot flag is off, and fails closed under wrong branch or storage", async () => {
  const off = fixture({ env: { ...safeEnv, AMS_QUICK_AUDIT_PILOT_BUYER_RESULT_ENABLED: undefined } })
  assert.equal(await off.handler(request(token)), null)
  assert.equal(off.reads().stripeReads, 0)
  for (const patch of [
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { AMS_QUICK_AUDIT_REPORT_ACCESS_REQUIRED: undefined },
    { AMS_QUICK_AUDIT_REPORT_ACCESS_SECRET: undefined },
    { AMS_STRIPE_PILOT_ACCOUNT_ID: "acct_original_live" },
    { AMS_STRIPE_PILOT_REDIS_REST_URL: "https://" + RESEND_PREVIEW_REDIS_HOST },
  ]) {
    const f = fixture({ env: { ...safeEnv, ...patch } })
    const response = await f.handler(request(token))
    assert.equal(response?.status, 503)
    assert.equal(f.reads().stripeReads, 0)
    assert.equal(f.reads().storeReads, 0)
  }
})
