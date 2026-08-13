import type Stripe from "stripe"
import { Redis } from "@upstash/redis"

import { sendAmsN8nWebhook, type JsonValue } from "./ams-n8n-webhook-client"

const QUICK_AUDIT_NAME = "Quick Marketing Audit"
const QUICK_AUDIT_AMOUNT = 4900
const QUICK_AUDIT_CURRENCY = "usd"
const QUICK_AUDIT_TTL_SECONDS = 60 * 60 * 24 * 90

export type QuickAuditFulfillmentStatus =
  | "queued"
  | "ai_draft_ready"
  | "manual_review_required"

export type QuickAuditFulfillmentRecord = {
  status: QuickAuditFulfillmentStatus
  stripeEventId: string
  checkoutSessionId: string
  paymentIntentId: string | null
  customerEmail: string
  customerName: string | null
  amountTotal: number
  currency: string
  intake: Record<string, string>
  n8nRequestId: string | null
  n8nResult: JsonValue | null
  createdAt: string
  updatedAt: string
}

function redisClient() {
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)?.trim()
  if (!url || !token) return null
  return new Redis({ url, token })
}

function asId(value: string | { id: string } | null): string | null {
  if (!value) return null
  return typeof value === "string" ? value : value.id
}

function intakeFromCustomFields(session: Stripe.Checkout.Session): Record<string, string> {
  const intake: Record<string, string> = {}
  for (const field of session.custom_fields ?? []) {
    let value = ""
    if (field.text?.value) value = field.text.value.trim()
    else if (field.dropdown?.value) value = field.dropdown.value.trim()
    else if (field.numeric?.value) value = field.numeric.value.trim()
    if (value) intake[field.key] = value
  }
  return intake
}

function lineItemLooksLikeQuickAudit(item: Stripe.LineItem) {
  const description = item.description?.trim().toLowerCase() ?? ""
  const price = item.price
  return (
    description === QUICK_AUDIT_NAME.toLowerCase() &&
    (item.quantity ?? 1) === 1 &&
    price?.type === "one_time" &&
    price.unit_amount === QUICK_AUDIT_AMOUNT &&
    price.currency?.toLowerCase() === QUICK_AUDIT_CURRENCY
  )
}

export async function fulfillQuickAuditCheckout(input: {
  stripe: Stripe
  event: Stripe.Event
}): Promise<
  | { matched: false }
  | {
      matched: true
      status: QuickAuditFulfillmentStatus
      checkoutSessionId: string
      n8nRequestId: string | null
    }
> {
  if (input.event.type !== "checkout.session.completed") return { matched: false }

  const eventSession = input.event.data.object as Stripe.Checkout.Session
  if (eventSession.mode !== "payment") return { matched: false }

  const session = await input.stripe.checkout.sessions.retrieve(eventSession.id, {
    expand: ["line_items.data.price"],
  })

  if (
    session.mode !== "payment" ||
    session.status !== "complete" ||
    session.payment_status !== "paid" ||
    session.amount_total !== QUICK_AUDIT_AMOUNT ||
    session.currency?.toLowerCase() !== QUICK_AUDIT_CURRENCY
  ) {
    return { matched: false }
  }

  const lineItems = session.line_items?.data ?? []
  if (lineItems.length !== 1 || !lineItemLooksLikeQuickAudit(lineItems[0])) {
    return { matched: false }
  }

  const customerEmail =
    session.customer_details?.email?.trim().toLowerCase() ??
    session.customer_email?.trim().toLowerCase() ??
    ""
  if (!customerEmail || !customerEmail.includes("@")) {
    throw new Error("QUICK_AUDIT_CUSTOMER_EMAIL_MISSING")
  }

  const redis = redisClient()
  if (!redis) throw new Error("QUICK_AUDIT_REDIS_UNCONFIGURED")

  const key = `ams:quick-audit:checkout:${session.id}`
  const existing = await redis.get<QuickAuditFulfillmentRecord>(key)
  if (existing) {
    return {
      matched: true,
      status: existing.status,
      checkoutSessionId: session.id,
      n8nRequestId: existing.n8nRequestId,
    }
  }

  const now = new Date().toISOString()
  const intake = intakeFromCustomFields(session)
  const baseRecord: QuickAuditFulfillmentRecord = {
    status: "queued",
    stripeEventId: input.event.id,
    checkoutSessionId: session.id,
    paymentIntentId: asId(session.payment_intent),
    customerEmail,
    customerName: session.customer_details?.name?.trim() || null,
    amountTotal: session.amount_total,
    currency: session.currency.toLowerCase(),
    intake,
    n8nRequestId: null,
    n8nResult: null,
    createdAt: now,
    updatedAt: now,
  }

  await redis.set(key, baseRecord, { nx: true, ex: QUICK_AUDIT_TTL_SECONDS })

  let finalRecord = baseRecord
  try {
    const n8n = await sendAmsN8nWebhook({
      action: "content.launch",
      idempotencyKey: `quick-audit:${session.id}`,
      requestId: `quick-audit-${session.id}`,
      payload: {
        job_type: "quick_marketing_audit",
        checkout_session_id: session.id,
        stripe_event_id: input.event.id,
        customer_email: customerEmail,
        customer_name: baseRecord.customerName,
        intake,
        fulfillment_contract:
          "Create an evidence-based Quick Marketing Audit draft for human review. Do not email the customer, make guarantees, invent analytics, or claim private facts. Required sections: Executive Snapshot; Five Marketing Problems; Five Specific Fixes; Improved Headline; Improved Offer; One Promotional Post; Seven-Day Action Plan; Priority Summary.",
      },
      meta: {
        source: "stripe_quick_audit",
        paid: true,
        amount_total: QUICK_AUDIT_AMOUNT,
        currency: QUICK_AUDIT_CURRENCY,
      },
    })

    finalRecord = {
      ...baseRecord,
      status: n8n.ok ? "ai_draft_ready" : "manual_review_required",
      n8nRequestId: n8n.request_id,
      n8nResult: n8n.result ?? null,
      updatedAt: new Date().toISOString(),
    }
  } catch {
    finalRecord = {
      ...baseRecord,
      status: "manual_review_required",
      updatedAt: new Date().toISOString(),
    }
  }

  await redis.set(key, finalRecord, { ex: QUICK_AUDIT_TTL_SECONDS })
  await redis.set(
    `ams:quick-audit:event:${input.event.id}`,
    { checkoutSessionId: session.id, status: finalRecord.status },
    { ex: QUICK_AUDIT_TTL_SECONDS },
  )

  return {
    matched: true,
    status: finalRecord.status,
    checkoutSessionId: session.id,
    n8nRequestId: finalRecord.n8nRequestId,
  }
}
