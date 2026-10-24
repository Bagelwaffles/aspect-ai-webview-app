/**
 * Dedicated AMS Quick Audit Stripe sandbox webhook intake.
 * Does not produce an audit, accept a payment, enqueue delivery, or send email.
 * Fail closed until a physically separate Preview datastore is configured.
 */
import { createHash } from "node:crypto"
import Stripe from "stripe"

import { RESEND_PREVIEW_BRANCH } from "./quick-audit-resend-preview-preflight"

export const AMS_PILOT_STRIPE_ACCOUNT = "acct_1UTtFMGuhFCl8JHa"
const RETENTION_SECONDS = 60 * 60 * 24 * 90
const MAX_BODY_BYTES = 256_000
const KEY_NAMESPACE = /^ams:preview:stripe-pilot:[a-z0-9-]{8,80}:$/u
const EVENT_ID = /^evt_[a-zA-Z0-9]{8,200}$/u

export interface PilotEventRedis {
  set(key: string, value: string, opts: { nx: true; ex: number }): Promise<unknown>
  get<T = unknown>(key: string): Promise<T | null>
}

export type PilotReceipt = {
  id: string
  type: string
  digest: string
  livemode: false
  recordedAt: string
}

/**
 * A distinct URL is only a necessary condition; project/DB identity,
 * credentials, and ACL independence still require separate proof.
 */
export function pilotIntakeConfiguration(env: NodeJS.ProcessEnv) {
  const ownUrl = env.AMS_STRIPE_PILOT_REDIS_REST_URL?.trim()
  const proofUrl = env.AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL?.trim()
  const defaults = [env.UPSTASH_REDIS_REST_URL, env.KV_REST_API_URL]
  let host: string | undefined
  try {
    const url = new URL(ownUrl ?? "")
    if (url.protocol !== "https:" || url.username || url.password ||
        url.port || url.pathname !== "/" || url.search || url.hash) {
      return { ready: false, code: "PILOT_STORAGE_NOT_ISOLATED" } as const
    }
    host = url.hostname.toLowerCase()
    if (!host || !host.endsWith(".upstash.io")) {
      return { ready: false, code: "PILOT_STORAGE_NOT_ISOLATED" } as const
    }
    for (const other of [proofUrl, ...defaults]) {
      if (!other?.trim()) continue
      const otherUrl = new URL(other)
      if (otherUrl.hostname.toLowerCase() === host) {
        return { ready: false, code: "PILOT_STORAGE_NOT_ISOLATED" } as const
      }
    }
  } catch {
    return { ready: false, code: "PILOT_STORAGE_NOT_ISOLATED" } as const
  }

  if (env.VERCEL_ENV !== "preview" ||
      env.VERCEL_GIT_COMMIT_REF !== RESEND_PREVIEW_BRANCH ||
      env.AMS_STRIPE_PILOT_ACCOUNT_ID !== AMS_PILOT_STRIPE_ACCOUNT ||
      env.AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED !== "true" ||
      env.AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED === "true" ||
      env.AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED === "true") {
    return { ready: false, code: "PILOT_INTAKE_DISABLED" } as const
  }
  if (!env.AMS_STRIPE_PILOT_WEBHOOK_SECRET?.startsWith("whsec_") ||
      env.AMS_STRIPE_PILOT_WEBHOOK_SECRET.length < 20 ||
      !env.AMS_STRIPE_PILOT_REDIS_REST_TOKEN?.trim() ||
      !KEY_NAMESPACE.test(env.AMS_STRIPE_PILOT_REDIS_NAMESPACE ?? "")) {
    return { ready: false, code: "PILOT_INTAKE_UNCONFIGURED" } as const
  }
  return { ready: true, code: "PILOT_INTAKE_CONFIGURED", host } as const
}

function outcome(status: number, code: string, duplicate = false): Response {
  return Response.json({ ok: false, code, duplicate, paymentTestPerformed: false,
    sendEnabled: false, fulfillmentEnabled: false }, {
      status,
      headers: { "Cache-Control": "no-store" },
    })
}

export async function handlePilotStripeWebhook(
  request: Request,
  input: {
    env: NodeJS.ProcessEnv
    store: PilotEventRedis | null
    now?: () => Date
  },
): Promise<Response> {
  const env = input.env
  const config = pilotIntakeConfiguration(env)
  if (!config.ready || !input.store) {
    return outcome(503, config.ready ? "PILOT_STORAGE_UNAVAILABLE" : config.code)
  }
  const signature = request.headers.get("stripe-signature")
  if (!signature) return outcome(400, "PILOT_SIGNATURE_MISSING")
  const raw = await request.text().catch(() => "")
  if (!raw || Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return outcome(413, "PILOT_PAYLOAD_INVALID")
  }

  let event: Stripe.Event
  try {
    const stripe = new Stripe("sk_test_synthetic_only_stripe_signature_verifier")
    event = stripe.webhooks.constructEvent(raw, signature, env.AMS_STRIPE_PILOT_WEBHOOK_SECRET!)
  } catch {
    return outcome(400, "PILOT_SIGNATURE_INVALID")
  }

  if (!EVENT_ID.test(event.id) || event.livemode !== false ||
      (event.account && event.account !== AMS_PILOT_STRIPE_ACCOUNT)) {
    return outcome(403, "PILOT_EVENT_SCOPE_DENIED")
  }
  // Ignore every other event type. A valid signature is the only admission
  // credential; no customer data is persisted for unrelated events.
  if (event.type !== "checkout.session.completed") {
    return Response.json({ ok: true, code: "PILOT_EVENT_IGNORED",
      fulfillmentEnabled: false, sendEnabled: false },
      { status: 200, headers: { "Cache-Control": "no-store" } })
  }

  const digest = createHash("sha256").update(raw).digest("hex")
  const receipt: PilotReceipt = {
    id: event.id, type: event.type, digest, livemode: false,
    recordedAt: (input.now ?? (() => new Date()))().toISOString(),
  }
  const key = env.AMS_STRIPE_PILOT_REDIS_NAMESPACE! + "event:" + event.id
  try {
    const created = await input.store.set(
      key, JSON.stringify(receipt), { nx: true, ex: RETENTION_SECONDS },
    )
    if (created !== "OK" && created !== true) {
      const existing = await input.store.get<unknown>(key)
      const parsed: unknown = typeof existing === "string"
        ? JSON.parse(existing) : existing
      if (!parsed || typeof parsed !== "object" ||
          (parsed as PilotReceipt).id !== event.id ||
          (parsed as PilotReceipt).digest !== digest) {
        return outcome(409, "PILOT_EVENT_COLLISION")
      }
      // Repeated signed events never start a second fulfillment operation.
      // 503 prevents Stripe from mistaking receipt storage for paid fulfillment.
      return outcome(503, "PILOT_FULFILLMENT_NOT_ENABLED", true)
    }
    return outcome(503, "PILOT_FULFILLMENT_NOT_ENABLED")
  } catch {
    return outcome(503, "PILOT_RECEIPT_STORE_UNAVAILABLE")
  }
}
