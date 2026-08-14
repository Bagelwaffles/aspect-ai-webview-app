import assert from "node:assert/strict"
import test from "node:test"

import { NextRequest } from "next/server"
import Stripe from "stripe"

import { createQuickAuditCheckoutHandler } from "../lib/server/quick-audit-checkout"
import {
  collectQuickAuditEvidence,
  createQuickAuditAuditGateway,
  processQuickAuditCheckout,
  QuickAuditFulfillmentError,
  RedisQuickAuditStore,
  type QuickAuditRecord,
  type QuickAuditStore,
} from "../lib/server/quick-audit-fulfillment"
import { createQuickAuditWebhookHandler } from "../lib/server/quick-audit-webhook"
import type { StripeEventClaim } from "../lib/server/entitlements"

const priceId = "price_quick_audit_test"
const secretKey = "sk_test_quick_audit_fixture"
const liveSecretKey = "rk_live_quick_audit_fixture"
const webhookSecret = "whsec_quick_audit_fixture"

function session(input: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: "cs_test_quick_audit",
    object: "checkout.session",
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    livemode: false,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    metadata: {
      ams_offer: "quick-marketing-audit",
      ams_request_id: "quick-audit-request-001",
      ams_business_name: "Example Business",
      ams_website_url: "https://example.com",
      ams_industry: "Professional services",
      ams_goals: "Improve lead conversion",
      ams_notes: "Sanitized test input",
    },
    ...input,
  } as Stripe.Checkout.Session
}

function event(value = session(), id = "evt_quick_audit_001"): Stripe.Event {
  return {
    id,
    object: "event",
    api_version: "2023-10-16",
    created: 1_786_600_000,
    data: { object: value },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type: "checkout.session.completed",
  } as Stripe.Event
}

function lineItems(id = priceId): Stripe.ApiList<Stripe.LineItem> {
  return {
    object: "list",
    data: [{ id: "li_quick", object: "item", quantity: 1, price: { id } } as Stripe.LineItem],
    has_more: false,
    url: "/v1/checkout/sessions/cs_test_quick_audit/line_items",
  }
}

class MemoryStore implements QuickAuditStore {
  records = new Map<string, QuickAuditRecord | { status: "processing"; requestId: string; token: string }>()
  async reserve(input: { checkoutSessionId: string; stripeEventId: string; requestId: string }) {
    const existing = this.records.get(input.checkoutSessionId)
    if (existing?.status === "completed") {
      if (existing.requestId !== input.requestId) return { state: "conflict" as const }
      return { state: "duplicate" as const, record: existing }
    }
    if (existing) return { state: "processing" as const }
    this.records.set(input.checkoutSessionId, { status: "processing", requestId: input.requestId, token: "claim-token" })
    return { state: "reserved" as const, token: "claim-token" }
  }
  async complete(input: QuickAuditRecord & { token: string }) {
    const { token: _token, ...record } = input
    this.records.set(input.checkoutSessionId, record)
  }
  async release(input: { checkoutSessionId: string }) { this.records.delete(input.checkoutSessionId) }
}

function processingFixture(overrides: { session?: Stripe.Checkout.Session; store?: MemoryStore; auditFailure?: Error } = {}) {
  const checkout = overrides.session ?? session()
  const store = overrides.store ?? new MemoryStore()
  let audits = 0
  return {
    store,
    audits: () => audits,
    run: () => processQuickAuditCheckout({
      event: event(checkout),
      expectedPriceId: priceId,
      expectedLivemode: false,
      store,
      gateway: {
        retrieveCheckoutSession: async () => checkout,
        listLineItems: async () => lineItems(),
      },
      evidenceCollector: async () => ({ hasClearValueProposition: true }),
      auditGateway: { run: async () => {
        audits += 1
        if (overrides.auditFailure) throw overrides.auditFailure
        return { auditId: "audit_verified_001" }
      } },
    }),
  }
}

test("paid Quick Audit completes once and persists all four durable identifiers", async () => {
  const fixture = processingFixture()
  const result = await fixture.run()
  assert.equal(result.applied, true)
  const stored = fixture.store.records.get("cs_test_quick_audit") as QuickAuditRecord
  assert.equal(stored.checkoutSessionId, "cs_test_quick_audit")
  assert.equal(stored.stripeEventId, "evt_quick_audit_001")
  assert.equal(stored.requestId, "quick-audit-request-001")
  assert.equal(stored.n8nAuditId, "audit_verified_001")
})

test("session replay is idempotent and does not run n8n twice", async () => {
  const fixture = processingFixture()
  await fixture.run()
  const replay = await fixture.run()
  assert.equal(replay.duplicate, true)
  assert.equal(fixture.audits(), 1)
})

test("durable completion atomically links the Checkout, event, request, and n8n audit identifiers", async () => {
  let keys: string[] = []
  let args: unknown[] = []
  const redis = {
    eval: async (_script: string, capturedKeys: string[], capturedArgs: unknown[]) => {
      keys = capturedKeys
      args = capturedArgs
      return 1
    },
  }
  const store = new RedisQuickAuditStore(redis)
  await store.complete({
    status: "completed",
    checkoutSessionId: "cs_test_linked",
    stripeEventId: "evt_linked",
    requestId: "request-linked",
    n8nAuditId: "audit_linked",
    completedAt: "2026-08-13T00:00:00.000Z",
    token: "claim-token",
  })
  assert.deepEqual(keys, [
    "ams:quick-audit:session:cs_test_linked",
    "ams:quick-audit:event:evt_linked",
    "ams:quick-audit:request:request-linked",
    "ams:quick-audit:audit:audit_linked",
  ])
  assert.equal(String(args[1]).includes("claim-token"), false)
  assert.equal(args[3], "cs_test_linked")
})

test("unpaid and expired Checkout Sessions fail closed", async () => {
  await assert.rejects(processingFixture({ session: session({ payment_status: "unpaid" }) }).run, (error) => error instanceof QuickAuditFulfillmentError && error.code === "QUICK_AUDIT_PAYMENT_UNSETTLED")
  await assert.rejects(processingFixture({ session: session({ expires_at: 1 }) }).run, (error) => error instanceof QuickAuditFulfillmentError && error.code === "QUICK_AUDIT_SESSION_EXPIRED")
})

test("unapproved one-time price is ignored without n8n execution", async () => {
  let audits = 0
  const result = await processQuickAuditCheckout({
    event: event(), expectedPriceId: "price_other", expectedLivemode: false, store: new MemoryStore(),
    gateway: { retrieveCheckoutSession: async () => session(), listLineItems: async () => lineItems() },
    evidenceCollector: async () => ({ hasPrimaryCta: false }),
    auditGateway: { run: async () => { audits += 1; return { auditId: "never" } } },
  })
  assert.equal(result.reason, "UNAPPROVED_ONE_TIME_PRODUCT")
  assert.equal(audits, 0)
})

test("n8n failure releases the durable claim for a safe Stripe retry", async () => {
  const fixture = processingFixture({ auditFailure: new QuickAuditFulfillmentError("QUICK_AUDIT_N8N_FAILED", "sanitized", 502) })
  await assert.rejects(fixture.run, /sanitized/u)
  assert.equal(fixture.store.records.size, 0)
})

test("n8n timeout is sanitized and never exposes the gateway key", async () => {
  const key = "server-only-gateway-key-fixture"
  const gateway = createQuickAuditAuditGateway({
    webhookUrl: "https://n8n.example/webhook/audit",
    internalKey: key,
    timeoutMs: 1,
    fetchImpl: (async (_url, init) => {
      await new Promise((resolve) => init?.signal?.addEventListener("abort", resolve, { once: true }))
      throw Object.assign(new Error("aborted"), { name: "AbortError" })
    }) as typeof fetch,
  })
  await assert.rejects(
    gateway.run({ businessName: "A", websiteUrl: "https://example.com", industry: "B", goals: "C", notes: "", requestId: "request-001", evidence: { hasPrimaryCta: true } }),
    (error) => error instanceof QuickAuditFulfillmentError && error.code === "QUICK_AUDIT_N8N_TIMEOUT" && !error.message.includes(key),
  )
})

test("Quick Audit webhook verifies its own test signature and rejects malformed signatures", async () => {
  const stripe = new Stripe(secretKey)
  const payload = JSON.stringify(event())
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret })
  const claims = new Map<string, StripeEventClaim>()
  const handler = createQuickAuditWebhookHandler({
    env: { ...process.env, AMS_STRIPE_QUICK_AUDIT_SECRET_KEY: secretKey, AMS_STRIPE_QUICK_AUDIT_WEBHOOK_SECRET: webhookSecret, AMS_STRIPE_QUICK_AUDIT_PRICE_ID: priceId },
    createStripe: () => {
      const sessions = stripe.checkout.sessions as unknown as {
        retrieve: (id: string) => Promise<Stripe.Checkout.Session>
        listLineItems: (id: string) => Promise<Stripe.ApiList<Stripe.LineItem>>
      }
      sessions.retrieve = async () => session()
      sessions.listLineItems = async () => ({ data: [{ price: { id: priceId }, quantity: 1 }] }) as Stripe.ApiList<Stripe.LineItem>
      return stripe
    },
    claimEvent: async (id) => { const current = claims.get(id); if (current) return current; const claim = { state: "claimed", token: "event-token" } as StripeEventClaim; claims.set(id, claim); return claim },
    completeEvent: async (id) => { claims.set(id, { state: "completed" } as StripeEventClaim) },
    releaseEvent: async (id) => { claims.delete(id) },
    store: new MemoryStore(),
    evidenceCollector: async () => ({ hasPrimaryCta: true }),
    auditGateway: { run: async () => ({ auditId: "audit_signed" }) },
  })
  const signed = await handler(new NextRequest("https://ams.example/api/webhooks/stripe", { method: "POST", headers: { "stripe-signature": signature }, body: payload }))
  assert.equal(signed?.status, 200)
  assert.equal((await signed?.json()).applied, true)
  const malformed = await handler(new NextRequest("https://ams.example/api/webhooks/stripe", { method: "POST", headers: { "stripe-signature": "invalid" }, body: payload }))
  assert.equal(malformed, null)
})

test("checkout route creates only a live one-time session after public sales approval and returns no secrets", async () => {
  let params: Stripe.Checkout.SessionCreateParams | null = null
  const handler = createQuickAuditCheckoutHandler({
    env: { ...process.env, AMS_QUICK_AUDIT_PUBLIC_SALES_ENABLED: "true", AMS_STRIPE_QUICK_AUDIT_LIVE_SECRET_KEY: liveSecretKey, AMS_STRIPE_QUICK_AUDIT_LIVE_PRICE_ID: priceId, PUBLIC_APP_URL: "https://www.aspectmarketingsolutions.app" },
    idFactory: () => "request-fixed",
    createSession: async (_key, input) => { params = input; return { id: "cs_test_created", url: "https://checkout.stripe.test/session" } },
  })
  const response = await handler(new NextRequest("https://www.aspectmarketingsolutions.app/api/quick-marketing-audit/checkout", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ businessName: "Example", websiteUrl: "https://example.com", industry: "Services", goals: "More leads", notes: "Test" }),
  }))
  const body = await response.json()
  assert.equal(response.status, 200)
  const createdParams = params as Stripe.Checkout.SessionCreateParams | null
  assert.equal(createdParams?.mode, "payment")
  assert.equal(createdParams?.line_items?.[0]?.price, priceId)
  assert.equal(JSON.stringify(body).includes(liveSecretKey), false)
  assert.equal(JSON.stringify(body).includes("AMS_N8N_INTERNAL_KEY"), false)
})

test("checkout route rejects malformed URLs and oversized intake before Stripe work", async () => {
  let createCalls = 0
  const handler = createQuickAuditCheckoutHandler({
    env: { ...process.env, AMS_QUICK_AUDIT_PUBLIC_SALES_ENABLED: "true", AMS_STRIPE_QUICK_AUDIT_LIVE_SECRET_KEY: liveSecretKey, AMS_STRIPE_QUICK_AUDIT_LIVE_PRICE_ID: priceId, PUBLIC_APP_URL: "https://www.aspectmarketingsolutions.app" },
    createSession: async () => { createCalls += 1; return { id: "unexpected", url: "https://checkout.stripe.test/unexpected" } },
  })
  for (const input of [
    { businessName: "Example", websiteUrl: "not-a-url", industry: "Services", goals: "More leads", notes: "" },
    { businessName: "Example", websiteUrl: "https://example.com", industry: "Services", goals: "x".repeat(501), notes: "" },
  ]) {
    const response = await handler(new NextRequest("https://www.aspectmarketingsolutions.app/api/quick-marketing-audit/checkout", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    }))
    assert.equal(response.status, 400)
  }
  assert.equal(createCalls, 0)
})

test("checkout route creates no Stripe session while public sales are disabled", async () => {
  let createCalls = 0
  const handler = createQuickAuditCheckoutHandler({
    env: { ...process.env, AMS_QUICK_AUDIT_PUBLIC_SALES_ENABLED: "false", AMS_STRIPE_QUICK_AUDIT_LIVE_SECRET_KEY: liveSecretKey, AMS_STRIPE_QUICK_AUDIT_LIVE_PRICE_ID: priceId },
    createSession: async () => { createCalls += 1; return { id: "unexpected", url: "https://checkout.stripe.test/unexpected" } },
  })
  const response = await handler(new NextRequest("https://www.aspectmarketingsolutions.app/api/quick-marketing-audit/checkout", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ businessName: "Example", websiteUrl: "https://example.com", industry: "Services", goals: "More leads", notes: "" }),
  }))
  assert.equal(response.status, 503)
  assert.equal((await response.json()).code, "QUICK_AUDIT_SALES_DISABLED")
  assert.equal(createCalls, 0)
})

test("non-Quick-Audit Stripe events fall through to the existing subscription webhook", async () => {
  const stripe = new Stripe(secretKey)
  const nonQuickEvent = { ...event(), type: "invoice.paid" } as Stripe.Event
  const payload = JSON.stringify(nonQuickEvent)
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret })

  const handler = createQuickAuditWebhookHandler({
    env: {
      ...process.env,
      AMS_STRIPE_QUICK_AUDIT_SECRET_KEY: secretKey,
      AMS_STRIPE_QUICK_AUDIT_WEBHOOK_SECRET: webhookSecret,
      AMS_STRIPE_QUICK_AUDIT_PRICE_ID: priceId,
    },
    createStripe: () => stripe,
    claimEvent: async () => { throw new Error("SHOULD_NOT_CLAIM_EVENT") },
    completeEvent: async () => undefined,
    releaseEvent: async () => undefined,
    store: new MemoryStore(),
    evidenceCollector: async () => ({ hasPrimaryCta: true }),
    auditGateway: { run: async () => ({ auditId: "unexpected" }) },
  })

  const response = await handler(
    new NextRequest("https://ams.example/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": signature },
      body: payload,
    }),
  )

  assert.equal(response, null)
})

test("website evidence collection refuses redirects into private networks", async () => {
  let fetchCalls = 0

  const fetchImpl = (async () => {
    fetchCalls += 1
    return new Response("", {
      status: 302,
      headers: {
        location: "http://127.0.0.1/internal",
      },
    })
  }) as typeof fetch

  await assert.rejects(
    collectQuickAuditEvidence("https://example.com", fetchImpl),
    (error) =>
      error instanceof QuickAuditFulfillmentError &&
      error.code === "QUICK_AUDIT_WEBSITE_UNSAFE",
  )

  assert.equal(fetchCalls, 1)
})

test("Quick Audit checkout refuses to fall back to the general Stripe secret", async () => {
  let createCalls = 0

  const handler = createQuickAuditCheckoutHandler({
    env: {
      NODE_ENV: "test",
      AMS_QUICK_AUDIT_PUBLIC_SALES_ENABLED: "true",
      STRIPE_SECRET_KEY: liveSecretKey,
      AMS_STRIPE_QUICK_AUDIT_LIVE_PRICE_ID: priceId,
      PUBLIC_APP_URL: "https://www.aspectmarketingsolutions.app",
    },
    createSession: async () => {
      createCalls += 1
      return { id: "unexpected", url: "https://checkout.stripe.test/unexpected" }
    },
  })

  const response = await handler(
    new NextRequest("https://www.aspectmarketingsolutions.app/api/quick-marketing-audit/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        businessName: "Example",
        websiteUrl: "https://example.com",
        industry: "Services",
        goals: "More leads",
        notes: "",
      }),
    }),
  )

  assert.equal(response.status, 503)
  assert.equal((await response.json()).code, "QUICK_AUDIT_CHECKOUT_UNCONFIGURED")
  assert.equal(createCalls, 0)
})

test("Quick Audit webhook refuses to fall back to general Stripe webhook credentials", async () => {
  const stripe = new Stripe(liveSecretKey)
  const liveEvent = {
    ...event(),
    livemode: true,
    data: {
      object: session({ livemode: true }),
    },
  } as Stripe.Event

  const payload = JSON.stringify(liveEvent)
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecret,
  })

  let createStripeCalls = 0
  let claimCalls = 0

  const handler = createQuickAuditWebhookHandler({
    env: {
      NODE_ENV: "test",
      STRIPE_SECRET_KEY: liveSecretKey,
      STRIPE_WEBHOOK_SECRET: webhookSecret,
      AMS_STRIPE_QUICK_AUDIT_LIVE_PRICE_ID: priceId,
    },
    createStripe: () => {
      createStripeCalls += 1
      return stripe
    },
    claimEvent: async () => {
      claimCalls += 1
      throw new Error("SHOULD_NOT_CLAIM_EVENT")
    },
    completeEvent: async () => undefined,
    releaseEvent: async () => undefined,
    store: new MemoryStore(),
    evidenceCollector: async () => ({ hasPrimaryCta: true }),
    auditGateway: { run: async () => ({ auditId: "unexpected" }) },
  })

  const response = await handler(
    new NextRequest("https://ams.example/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": signature },
      body: payload,
    }),
  )

  assert.equal(response, null)
  assert.equal(createStripeCalls, 0)
  assert.equal(claimCalls, 0)
})
