import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { Redis } from "@upstash/redis"
import { claimStripeEvent, completeStripeEvent, releaseStripeEvent } from "./entitlements"
import { createQuickAuditWebhookHandler } from "./quick-audit-webhook"
import { RedisQuickAuditStore } from "./quick-audit-fulfillment"
import { createNativeQuickAuditAuditGateway, RedisQuickAuditResultStore } from "./quick-audit-native"

const PILOT_BRANCH = "feat/audit-delivery-security-preview-20261023"
const MAIN_TEST_ACCOUNT = "acct_1Smr2bGloGM6sjzB"
const PILOT_PRICE = "price_1U47ZwGloGM6sjzB3awn1s2A"
const REDIS_ENDPOINT = "pretty-crab-239388.upstash.io"
const PILOT_REQUEST = "quick-audit-owner-five-dollar-20261026"
const MAX_OPEN_WINDOW_MS = 10 * 60 * 1000

function noStore(status: number, code: string) {
  return NextResponse.json({ ok: false, code }, { status, headers: { "Cache-Control": "no-store" } })
}

/** A distinct webhook intake gate; checkout readiness flags have no bearing on it. */
export function ownerPilotWebhookIntakeReady(env: NodeJS.ProcessEnv, requestUrl: string, now = Date.now()): boolean {
  let receiver: URL, redisUrl: URL
  try { receiver = new URL(requestUrl); redisUrl = new URL(env.AMS_QUICK_AUDIT_OWNER_PILOT_REDIS_REST_URL ?? "") }
  catch { return false }
  const untilText = env.AMS_QUICK_AUDIT_OWNER_PILOT_WEBHOOK_INTAKE_UNTIL ?? ""
  // A UTC ISO timestamp prevents ambiguous local time or indefinite windows.
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(untilText)) return false
  const until = Date.parse(untilText)
  return (
    env.VERCEL_ENV === "preview" &&
    env.VERCEL_GIT_COMMIT_REF === PILOT_BRANCH &&
    receiver.protocol === "https:" &&
    receiver.hostname.endsWith(".vercel.app") &&
    receiver.pathname === "/api/internal/quick-audit-pilot/webhook" &&
    redisUrl.protocol === "https:" &&
    redisUrl.hostname === REDIS_ENDPOINT &&
    !redisUrl.username && !redisUrl.password && !redisUrl.search && !redisUrl.hash && !redisUrl.port && redisUrl.pathname === "/" &&
    Boolean(env.AMS_QUICK_AUDIT_OWNER_PILOT_REDIS_REST_TOKEN?.trim()) &&
    env.AMS_QUICK_AUDIT_OWNER_PILOT_WEBHOOK_INTAKE_ENABLED === "true" &&
    Number.isFinite(until) && until > now && until - now <= MAX_OPEN_WINDOW_MS &&
    env.AMS_STRIPE_WEBHOOK_MODE === "test" &&
    /^(sk|rk)_test_/.test(env.AMS_STRIPE_QUICK_AUDIT_SECRET_KEY ?? "") &&
    (env.AMS_STRIPE_QUICK_AUDIT_WEBHOOK_SECRET ?? "").startsWith("whsec_") &&
    env.AMS_STRIPE_QUICK_AUDIT_PRICE_ID === PILOT_PRICE &&
    env.AMS_QUICK_AUDIT_PUBLIC_SALES_ENABLED !== "true" &&
    env.AMS_SUBSCRIPTION_CHECKOUT_ENABLED !== "true" &&
    env.AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED !== "true" &&
    env.AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED !== "true"
  )
}

/** Only the one owner pilot, never another Checkout or subscription, can enter. */
export function isSignedOwnerAuditPilotEvent(event: Stripe.Event): boolean {
  if (event.livemode || event.type !== "checkout.session.completed") return false
  if (event.account && event.account !== MAIN_TEST_ACCOUNT) return false
  const session = event.data.object as Stripe.Checkout.Session
  return session.mode === "payment" &&
    session.metadata?.ams_offer === "quick-marketing-audit" &&
    session.metadata?.ams_environment === "test-five-dollar-pilot" &&
    session.metadata?.ams_request_id === PILOT_REQUEST &&
    session.id.startsWith("cs_test_")
}

export async function ownerAuditPilotWebhookPOST(request: NextRequest, env: NodeJS.ProcessEnv = process.env) {
  if (!ownerPilotWebhookIntakeReady(env, request.url)) return noStore(503, "PILOT_WEBHOOK_INTAKE_DISABLED")
  const signature = request.headers.get("stripe-signature")
  if (!signature) return noStore(400, "PILOT_WEBHOOK_SIGNATURE_REQUIRED")
  const raw = await request.text()
  if (Buffer.byteLength(raw, "utf8") > 1024 * 1024) return noStore(413, "PILOT_WEBHOOK_TOO_LARGE")
  const key = env.AMS_STRIPE_QUICK_AUDIT_SECRET_KEY!.trim()
  const webhookSecret = env.AMS_STRIPE_QUICK_AUDIT_WEBHOOK_SECRET!.trim()
  const stripe = new Stripe(key)
  let event: Stripe.Event
  try { event = stripe.webhooks.constructEvent(raw, signature, webhookSecret) }
  catch { return noStore(400, "PILOT_WEBHOOK_SIGNATURE_INVALID") }
  if (!isSignedOwnerAuditPilotEvent(event)) return noStore(403, "PILOT_WEBHOOK_EVENT_REJECTED")
  try {
    const account = await stripe.accounts.retrieve()
    if (account.id !== MAIN_TEST_ACCOUNT) return noStore(403, "PILOT_WEBHOOK_ACCOUNT_MISMATCH")
  } catch { return noStore(503, "PILOT_WEBHOOK_ACCOUNT_UNAVAILABLE") }
  const redis = new Redis({
    url: env.AMS_QUICK_AUDIT_OWNER_PILOT_REDIS_REST_URL!.trim(),
    token: env.AMS_QUICK_AUDIT_OWNER_PILOT_REDIS_REST_TOKEN!.trim(),
  })
  // The generic subscription and Quick Audit Redis variables are deliberately NOT used.
  const handler = createQuickAuditWebhookHandler({
    env: {
      NODE_ENV: env.NODE_ENV ?? "production",
      AMS_STRIPE_QUICK_AUDIT_SECRET_KEY: key,
      AMS_STRIPE_QUICK_AUDIT_WEBHOOK_SECRET: webhookSecret,
      AMS_STRIPE_QUICK_AUDIT_PRICE_ID: PILOT_PRICE,
      AMS_STRIPE_WEBHOOK_MODE: "test",
      AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED: "false",
    },
    createStripe: () => stripe,
    claimEvent: (id) => claimStripeEvent(id, redis),
    completeEvent: (id, token) => completeStripeEvent(id, token, redis),
    releaseEvent: (id, token) => releaseStripeEvent(id, token, redis),
    store: new RedisQuickAuditStore(redis),
    auditGateway: createNativeQuickAuditAuditGateway({ store: new RedisQuickAuditResultStore(redis) }),
  })
  try {
    const response = await handler(new NextRequest(request.url, {
      method: "POST", headers: request.headers, body: raw,
    }))
    return response ?? noStore(403, "PILOT_WEBHOOK_NOT_HANDLED")
  } catch { return noStore(503, "PILOT_WEBHOOK_PROCESSING_FAILED") }
}

export function ownerAuditPilotWebhookGET(request: NextRequest, env: NodeJS.ProcessEnv = process.env) {
  return NextResponse.json({
    ok: true, scope: "owner-quick-audit-preview",
    intakeEnabled: ownerPilotWebhookIntakeReady(env, request.url),
  }, { headers: { "Cache-Control": "no-store" } })
}
