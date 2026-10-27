/**
 * Authenticated owner-only PULL of a Stripe-verified sandbox receipt written by
 * the standalone gateway (PR #306) into the existing ISOLATED payment Redis.
 * Never accepts a user-supplied payload/signature or makes an email call.
 *
 * The gateway first verifies genuine Stripe-origin HMAC; this owner pull then
 * independently retrieves the immutable event and paid checkout from Stripe,
 * verifies their identities against that restricted receipt, and calls the
 * existing atomic native audit + owner-only outbox worker.
 *
 * The owner MUST confirm the physical Redis binding before enabling this gate.
 */
import { createHash } from "node:crypto"
import Stripe from "stripe"
import { NextRequest, NextResponse } from "next/server"

import { authorizeOwnerApiRequest } from "./owner-api-auth"
import { processQuickAuditCheckout, QuickAuditFulfillmentError, type QuickAuditEvidence } from "./quick-audit-fulfillment"
import { createIsolatedPilotStores } from "./quick-audit-isolated-pilot-stores"
import { AMS_PILOT_STRIPE_ACCOUNT, pilotFulfillmentConfiguration } from "./quick-audit-isolated-stripe-pilot"
import { RESEND_PREVIEW_BRANCH } from "./quick-audit-resend-preview-preflight"

const GATEWAY_RECEIPT_PREFIX = "ams:preview:stripe-gateway:pr300:event:"
const EVENT_ID = /^evt_[A-Za-z0-9]{8,200}$/u
const SESSION_ID = /^cs_test_[A-Za-z0-9]{8,200}$/u
const RUN_ID = /^[A-Za-z0-9_-]{16,80}$/u
const MAX_AGE_MS = 30 * 60_000

type VerifiedReceipt = {
  kind: string
  id: string
  type: string
  account: string
  livemode: boolean
  digest: string
  checkoutSessionId: string
  requestId: string
  runId: string
  recordedAt: string
}

type Stores = NonNullable<ReturnType<typeof createIsolatedPilotStores>>
type RequestDeps = {
  env: NodeJS.ProcessEnv
  now: () => number
  owner: (request: NextRequest) => Promise<boolean>
  makeStripe: (key: string) => Stripe
  makeStores: (env: NodeJS.ProcessEnv) => Stores | null
  evidenceCollector?: (url: string) => Promise<QuickAuditEvidence>
}
const defaults: RequestDeps = {
  env: process.env,
  now: Date.now,
  owner: async request => (await authorizeOwnerApiRequest(request, {
    requireTrustedOrigin: true, env: process.env,
  })).ok,
  makeStripe: key => new Stripe(key),
  makeStores: env => createIsolatedPilotStores(env, undefined, "fulfillment"),
}

function reply(status: number, code: string) {
  return NextResponse.json({ ok: status === 200, code, emailSent: false, livePayment: false }, {
    status, headers: { "Cache-Control": "no-store" },
  })
}

export function ownerSignedReceiptHandoffReady(env: NodeJS.ProcessEnv, now: number) {
  const deadline = Date.parse(env.AMS_STRIPE_PILOT_HANDOFF_UNTIL ?? "")
  const owner = env.AMS_OWNER_EMAIL?.trim().toLowerCase()
  const recipient = env.AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL?.trim().toLowerCase()
  return pilotFulfillmentConfiguration(env).ready &&
    env.VERCEL_ENV === "preview" &&
    env.VERCEL_GIT_COMMIT_REF === RESEND_PREVIEW_BRANCH &&
    env.AMS_STRIPE_PILOT_HANDOFF_ENABLED === "true" &&
    env.AMS_STRIPE_PILOT_CHECKOUT_ENABLED !== "true" &&
    env.AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED !== "true" &&
    env.AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED === "true" &&
    env.AMS_QUICK_AUDIT_PILOT_DISPATCH_ENABLED !== "true" &&
    env.AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED !== "true" &&
    RUN_ID.test(env.AMS_STRIPE_PILOT_CHECKOUT_RUN_ID ?? "") &&
    SESSION_ID.test(env.AMS_STRIPE_PILOT_APPROVED_SESSION_ID ?? "") &&
    Boolean(owner && recipient && owner === recipient) &&
    Number.isFinite(deadline) && deadline > now && deadline - now <= 10 * 60_000
}

function decodeReceipt(value: unknown): VerifiedReceipt | null {
  try {
    const data: unknown = typeof value === "string" ? JSON.parse(value) : value
    if (!data || typeof data !== "object" || Array.isArray(data)) return null
    return data as VerifiedReceipt
  } catch { return null }
}

export function createOwnerSignedReceiptHandoff(overrides: Partial<RequestDeps> = {}) {
  const deps = { ...defaults, ...overrides }
  return async function ownerSignedReceiptHandoff(request: NextRequest) {
    if (!(await deps.owner(request))) return reply(401, "OWNER_SESSION_REQUIRED")
    const env = deps.env
    if (!ownerSignedReceiptHandoffReady(env, deps.now())) return reply(503, "PILOT_HANDOFF_CLOSED")

    const raw = await request.text().catch(() => "")
    if (!raw || raw.length > 200) return reply(400, "PILOT_EVENT_ID_INVALID")
    let body: unknown
    try { body = JSON.parse(raw) } catch { return reply(400, "PILOT_EVENT_ID_INVALID") }
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).length !== 1 ||
        !EVENT_ID.test((body as { eventId?: string }).eventId ?? "")) {
      return reply(400, "PILOT_EVENT_ID_INVALID")
    }
    const eventId = (body as { eventId: string }).eventId
    let stores: Stores
    try {
      const result = deps.makeStores(env)
      if (!result) return reply(503, "PILOT_STORAGE_UNAVAILABLE")
      stores = result
    } catch { return reply(503, "PILOT_STORAGE_UNAVAILABLE") }

    // No request body can inject an unverified payload or paid-customer data.
    let receipt: VerifiedReceipt
    try {
      const value = await stores.eventReceipts.get(GATEWAY_RECEIPT_PREFIX + eventId)
      const decoded = decodeReceipt(value)
      if (!decoded) return reply(404, "SIGNED_RECEIPT_NOT_FOUND")
      receipt = decoded
    } catch { return reply(503, "SIGNED_RECEIPT_STORE_UNAVAILABLE") }

    const runId = env.AMS_STRIPE_PILOT_CHECKOUT_RUN_ID!
    const sessionId = env.AMS_STRIPE_PILOT_APPROVED_SESSION_ID!
    const requestId = "quick-audit-" + createHash("sha256")
      .update(AMS_PILOT_STRIPE_ACCOUNT + ":" + runId).digest("hex").slice(0, 32)
    const receiptAt = Date.parse(receipt.recordedAt ?? "")
    const now = deps.now()
    if (receipt.kind !== "signed-owner-audit-v1" ||
        receipt.id !== eventId ||
        receipt.type !== "checkout.session.completed" ||
        receipt.account !== AMS_PILOT_STRIPE_ACCOUNT ||
        receipt.livemode !== false ||
        !/^[a-f0-9]{64}$/u.test(receipt.digest) ||
        receipt.checkoutSessionId !== sessionId ||
        receipt.requestId !== requestId || receipt.runId !== runId ||
        !Number.isFinite(receiptAt) || receiptAt > now + 60_000 ||
        now - receiptAt > MAX_AGE_MS) {
      return reply(403, "SIGNED_RECEIPT_MISMATCH")
    }

    let stripe: Stripe
    let event: Stripe.Event
    let paid: Stripe.Checkout.Session
    try {
      stripe = deps.makeStripe(env.AMS_STRIPE_PILOT_TEST_SECRET_KEY!)
      const account = await stripe.accounts.retrieve()
      if (account.id !== AMS_PILOT_STRIPE_ACCOUNT) return reply(503, "PILOT_ACCOUNT_MISMATCH")
      event = await stripe.events.retrieve(eventId)
      paid = await stripe.checkout.sessions.retrieve(sessionId)
    } catch { return reply(503, "STRIPE_PROVIDER_UNAVAILABLE") }

    const eventSession = event.data.object as Stripe.Checkout.Session
    const expectedOwner = env.AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL!.trim().toLowerCase()
    if (event.id !== eventId || event.livemode !== false ||
        (event.account && event.account !== AMS_PILOT_STRIPE_ACCOUNT) ||
        event.type !== "checkout.session.completed" ||
        eventSession.id !== sessionId || eventSession.livemode !== false ||
        eventSession.metadata?.ams_preview_run_id !== runId ||
        eventSession.metadata?.ams_request_id !== requestId ||
        paid.id !== sessionId || paid.livemode !== false ||
        paid.mode !== "payment" || paid.status !== "complete" ||
        paid.payment_status !== "paid" || paid.amount_total !== 4900 ||
        paid.currency !== "usd" ||
        paid.metadata?.ams_offer !== "quick-marketing-audit" ||
        paid.metadata?.ams_preview_run_id !== runId ||
        paid.metadata?.ams_request_id !== requestId ||
        paid.metadata?.ams_business_name !== "Aspect Marketing Solutions" ||
        paid.metadata?.ams_website_url !== "https://www.aspectmarketingsolutions.app" ||
        paid.metadata?.ams_industry !== "Marketing automation" ||
        paid.metadata?.ams_goals !== "Check real paid TEST fulfillment and branded owner-only report delivery" ||
        paid.customer_details?.email?.trim().toLowerCase() !== expectedOwner) {
      return reply(403, "PAID_AUDIT_PROVENANCE_DENIED")
    }

    try {
      const result = await processQuickAuditCheckout({
        event,
        gateway: {
          retrieveCheckoutSession: async id => id === sessionId ? paid : stripe.checkout.sessions.retrieve(id),
          listLineItems: id => stripe.checkout.sessions.listLineItems(id, { limit: 10 }),
        },
        store: stores.payment,
        auditGateway: stores.auditGateway,
        evidenceCollector: deps.evidenceCollector,
        expectedPriceId: env.AMS_STRIPE_PILOT_PRICE_ID!,
        expectedLivemode: false,
        onFulfilled: async item => {
          // This route NEVER sends an email; it queues only the owner.
          if (item.checkoutSessionId !== sessionId ||
              item.requestId !== requestId ||
              item.recipient.trim().toLowerCase() !== expectedOwner) {
            throw new Error("owner outbox identity mismatch")
          }
          await stores.outbox.enqueue({
            auditId: item.auditId, requestId, checkoutSessionId: sessionId,
            recipient: expectedOwner, paidAndPersisted: true,
          })
        },
      })
      const outbox = await stores.outbox.read(requestId)
      if (!outbox || outbox.checkoutSessionId !== sessionId ||
          outbox.recipient !== expectedOwner) {
        return reply(503, "PILOT_OUTBOX_NOT_QUEUED")
      }
      return reply(200, result.duplicate ? "PILOT_PAID_AUDIT_DUPLICATE" : "PILOT_PAID_AUDIT_QUEUED")
    } catch (error) {
      const code = error instanceof QuickAuditFulfillmentError
        ? error.code : "PILOT_FULFILLMENT_FAILED"
      return reply(503, code)
    }
  }
}
