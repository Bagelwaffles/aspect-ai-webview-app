import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

import {
  claimStripeEvent,
  completeStripeEvent,
  grantAgentEntitlement,
  grantTopupCredits,
  isEntitlementStoreConfigured,
  releaseStripeEvent,
  setPlanEntitlement,
  setSubscriptionStatus,
  type PlanSlug,
  type SubscriptionStatus,
} from "@/lib/server/entitlements"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const HANDLED_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
])

function redactId(id: string): string {
  return `${id.slice(0, 8)}...`
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null
  const email = value.trim().toLowerCase()
  return email.includes("@") ? email : null
}

function planFromMetadata(metadata: Stripe.Metadata | null | undefined): PlanSlug | null {
  const plan = metadata?.plan?.trim().toLowerCase()
  return plan === "starter" || plan === "growth" || plan === "pro" ? plan : null
}

function statusFromStripe(status: Stripe.Subscription.Status): SubscriptionStatus {
  if (status === "active") return "active"
  if (status === "trialing") return "trialing"
  if (status === "past_due" || status === "unpaid" || status === "incomplete") return "past_due"
  if (status === "canceled" || status === "incomplete_expired") return "canceled"
  return "inactive"
}

async function customerEmail(stripe: Stripe, customer: string | Stripe.Customer | Stripe.DeletedCustomer | null) {
  if (!customer) return null
  if (typeof customer !== "string") {
    return "email" in customer ? normalizeEmail(customer.email) : null
  }

  const record = await stripe.customers.retrieve(customer)
  return "email" in record ? normalizeEmail(record.email) : null
}

async function subscriptionFromInvoice(stripe: Stripe, invoice: Stripe.Invoice) {
  const subscription = invoice.subscription
  if (!subscription) return null
  return typeof subscription === "string" ? stripe.subscriptions.retrieve(subscription) : subscription
}

async function applySubscription(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  options: { resetPlanCredits: boolean; forcedStatus?: SubscriptionStatus },
) {
  const plan = planFromMetadata(subscription.metadata)
  const email =
    normalizeEmail(subscription.metadata.userEmail) ??
    (await customerEmail(stripe, subscription.customer))

  if (!plan || !email) {
    throw new Error("SUBSCRIPTION_METADATA_INCOMPLETE")
  }

  await setPlanEntitlement({
    email,
    plan,
    subscriptionStatus: options.forcedStatus ?? statusFromStripe(subscription.status),
    stripeCustomerId:
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    stripeSubscriptionId: subscription.id,
    resetPlanCredits: options.resetPlanCredits,
  })
}

async function processCheckoutSession(stripe: Stripe, session: Stripe.Checkout.Session) {
  const email =
    normalizeEmail(session.metadata?.userEmail) ??
    normalizeEmail(session.customer_details?.email) ??
    normalizeEmail(session.customer_email)

  if (!email) throw new Error("CHECKOUT_EMAIL_MISSING")

  const plan = planFromMetadata(session.metadata)
  if (session.mode === "subscription" && plan) {
    if (!session.subscription) throw new Error("CHECKOUT_SUBSCRIPTION_MISSING")
    const subscription =
      typeof session.subscription === "string"
        ? await stripe.subscriptions.retrieve(session.subscription)
        : session.subscription

    const metadata = {
      ...subscription.metadata,
      userEmail: subscription.metadata.userEmail || email,
      plan: subscription.metadata.plan || plan,
    }

    await setPlanEntitlement({
      email,
      plan,
      subscriptionStatus: statusFromStripe(subscription.status),
      stripeCustomerId:
        typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
      stripeSubscriptionId: subscription.id,
      resetPlanCredits: true,
    })

    if (metadata.userEmail !== subscription.metadata.userEmail || metadata.plan !== subscription.metadata.plan) {
      await stripe.subscriptions.update(subscription.id, { metadata })
    }
    return
  }

  const agentSlug = session.metadata?.agentSlug?.trim().toLowerCase()
  if (agentSlug) {
    await grantAgentEntitlement(email, agentSlug)
  }

  const topupCredits = Number.parseInt(session.metadata?.topupCredits ?? "0", 10)
  if (Number.isFinite(topupCredits) && topupCredits > 0) {
    await grantTopupCredits(email, topupCredits)
  }

  if (!agentSlug && !(topupCredits > 0)) {
    throw new Error("CHECKOUT_FULFILLMENT_METADATA_MISSING")
  }
}

async function processStripeEvent(stripe: Stripe, event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
      await processCheckoutSession(stripe, event.data.object as Stripe.Checkout.Session)
      return

    case "customer.subscription.created":
      await applySubscription(stripe, event.data.object as Stripe.Subscription, { resetPlanCredits: true })
      return

    case "customer.subscription.updated":
      await applySubscription(stripe, event.data.object as Stripe.Subscription, { resetPlanCredits: false })
      return

    case "customer.subscription.deleted":
      await applySubscription(stripe, event.data.object as Stripe.Subscription, {
        resetPlanCredits: false,
        forcedStatus: "canceled",
      })
      return

    case "invoice.payment_succeeded": {
      const subscription = await subscriptionFromInvoice(stripe, event.data.object as Stripe.Invoice)
      if (!subscription) throw new Error("INVOICE_SUBSCRIPTION_MISSING")
      await applySubscription(stripe, subscription, { resetPlanCredits: true })
      return
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice
      const subscription = await subscriptionFromInvoice(stripe, invoice)
      if (!subscription) throw new Error("INVOICE_SUBSCRIPTION_MISSING")
      const email =
        normalizeEmail(subscription.metadata.userEmail) ??
        (await customerEmail(stripe, subscription.customer))
      if (!email) throw new Error("SUBSCRIPTION_EMAIL_MISSING")
      await setSubscriptionStatus(email, "past_due")
      return
    }
  }
}

export async function POST(request: NextRequest) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim()
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim()

  if (!stripeSecretKey || !webhookSecret || !isEntitlementStoreConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Webhook fulfillment is not configured" },
      { status: 503 },
    )
  }

  const signature = request.headers.get("stripe-signature")
  if (!signature) {
    return NextResponse.json({ ok: false, error: "Missing signature header" }, { status: 400 })
  }

  const stripe = new Stripe(stripeSecretKey)
  const body = await request.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 400 })
  }

  if (!HANDLED_EVENT_TYPES.has(event.type)) {
    return NextResponse.json({ ok: true, received: true, processed: false, reason: "UNHANDLED_EVENT_TYPE" })
  }

  const claimed = await claimStripeEvent(event.id).catch(() => false)
  if (!claimed) {
    return NextResponse.json({ ok: true, received: true, processed: false, duplicate: true })
  }

  try {
    await processStripeEvent(stripe, event)
    await completeStripeEvent(event.id)
    console.info(`[Stripe] Fulfilled ${event.type} (${redactId(event.id)})`)
    return NextResponse.json({ ok: true, received: true, processed: true })
  } catch {
    await releaseStripeEvent(event.id)
    console.error(`[Stripe] Fulfillment failed for ${event.type} (${redactId(event.id)})`)
    return NextResponse.json({ ok: false, error: "Webhook fulfillment failed" }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      status: "listening",
      endpoint: "/api/webhooks/stripe",
      configured: Boolean(
        process.env.STRIPE_SECRET_KEY?.trim() &&
          process.env.STRIPE_WEBHOOK_SECRET?.trim() &&
          isEntitlementStoreConfigured(),
      ),
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
