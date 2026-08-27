import { createHash } from "node:crypto"

import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

import {
  creditTopupPack,
  isCreditTopupPackSlug,
  type CreditTopupPack,
} from "../credit-topups"
import { isStableCustomerSubject } from "../auth"
import {
  getEntitlementSnapshot,
  type EntitlementSnapshot,
  type StripeEventClaim,
} from "./entitlements"
import {
  grantCreditTopupOnce,
  reconcileCreditTopupReversal,
  type CreditTopupGrantInput,
  type CreditTopupGrantResult,
  type CreditTopupReversalInput,
  type CreditTopupReversalResult,
  type CreditTopupReversalSource,
} from "./credit-topup-store"
import { assertStripeSecretKeyMatchesMode } from "./stripe-entitlements"

export class CreditTopupFulfillmentError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus = 400,
  ) {
    super(message)
    this.name = "CreditTopupFulfillmentError"
  }
}

export type CreditTopupStripeGateway = {
  retrieveCheckoutSession: (id: string) => Promise<Stripe.Checkout.Session>
  retrievePaymentIntent?: (id: string) => Promise<Stripe.PaymentIntent>
  retrieveCharge?: (id: string) => Promise<Stripe.Charge>
  refundPaymentIntent?: (paymentIntentId: string, idempotencyKey: string) => Promise<Stripe.Refund>
}

export type CreditTopupGrant = (
  input: CreditTopupGrantInput,
) => Promise<CreditTopupGrantResult>

export type CreditTopupReconcile = (
  input: CreditTopupReversalInput,
) => Promise<CreditTopupReversalResult>

function objectId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === "string" && id.trim() ? id.trim() : null
  }
  return null
}

function requirePack(session: Stripe.Checkout.Session): CreditTopupPack {
  const packSlug = session.metadata?.topupPack
  if (!isCreditTopupPackSlug(packSlug)) {
    throw new CreditTopupFulfillmentError(
      "CREDIT_TOPUP_PACK_INVALID",
      "Credit top-up pack is missing or invalid",
    )
  }
  const pack = creditTopupPack(packSlug)
  if (
    session.metadata?.topupUnits !== String(pack.units) ||
    session.metadata?.priceLookupKey !== pack.lookupKey
  ) {
    throw new CreditTopupFulfillmentError(
      "CREDIT_TOPUP_METADATA_INVALID",
      "Credit top-up metadata does not match the approved pack",
    )
  }
  return pack
}

function requireStableSessionSubject(session: Stripe.Checkout.Session): string {
  const metadataSubject = session.metadata?.customerSubject?.trim()
  const referenceSubject = session.client_reference_id?.trim()
  if (!metadataSubject || !referenceSubject) {
    throw new CreditTopupFulfillmentError(
      "CREDIT_TOPUP_SUBJECT_MISSING",
      "Credit top-up customer identity is missing",
    )
  }
  if (
    metadataSubject !== referenceSubject ||
    !isStableCustomerSubject(metadataSubject)
  ) {
    throw new CreditTopupFulfillmentError(
      "CREDIT_TOPUP_SUBJECT_INVALID",
      "Credit top-up customer identity is invalid",
    )
  }
  return metadataSubject
}

function requireApprovedLineItem(
  session: Stripe.Checkout.Session,
  pack: CreditTopupPack,
): Stripe.Price {
  const items = session.line_items?.data ?? []
  if (items.length !== 1 || (items[0].quantity ?? 1) !== 1) {
    throw new CreditTopupFulfillmentError(
      "CREDIT_TOPUP_LINE_ITEM_INVALID",
      "Credit top-up checkout must contain exactly one approved pack",
    )
  }

  const price = items[0].price
  if (!price || typeof price === "string") {
    throw new CreditTopupFulfillmentError(
      "CREDIT_TOPUP_PRICE_MISSING",
      "Credit top-up price could not be verified",
    )
  }

  if (
    price.lookup_key !== pack.lookupKey ||
    price.type !== "one_time" ||
    price.recurring !== null ||
    price.currency !== "usd" ||
    price.unit_amount !== pack.priceCents ||
    price.metadata?.offer_type !== "credit_topup" ||
    price.metadata?.topup_units !== String(pack.units) ||
    price.metadata?.subscriber_only !== "true" ||
    price.metadata?.non_expiring !== "true"
  ) {
    throw new CreditTopupFulfillmentError(
      "CREDIT_TOPUP_PRICE_INVALID",
      "Credit top-up price is not an approved pack",
    )
  }

  return price
}

function requirePaymentIntentId(session: Stripe.Checkout.Session): string {
  const id = objectId(session.payment_intent)
  if (!id) {
    throw new CreditTopupFulfillmentError(
      "CREDIT_TOPUP_PAYMENT_INTENT_MISSING",
      "Credit top-up payment intent is missing",
    )
  }
  return id
}

function ineligibleRefundIdempotencyKey(sessionId: string): string {
  const digest = createHash("sha256").update(sessionId).digest("hex")
  return `ams-topup-ineligible-refund-${digest}`
}

function requireActiveSubscriber(snapshot: EntitlementSnapshot | null): "active" | "ineligible" {
  if (!snapshot?.configured) {
    throw new CreditTopupFulfillmentError(
      "CREDIT_TOPUP_ENTITLEMENTS_UNAVAILABLE",
      "Credit top-up entitlement verification is unavailable",
      503,
    )
  }
  return snapshot.subscriptionStatus === "active" || snapshot.subscriptionStatus === "trialing"
    ? "active"
    : "ineligible"
}

export async function processCreditTopupCheckout(input: {
  event: Stripe.Event
  gateway: CreditTopupStripeGateway
  grant: CreditTopupGrant
  getEntitlements?: (subject: string) => Promise<EntitlementSnapshot>
  expectedLivemode: boolean
}) {
  if (input.event.type !== "checkout.session.completed") {
    throw new CreditTopupFulfillmentError(
      "CREDIT_TOPUP_EVENT_INVALID",
      "Unsupported credit top-up event",
    )
  }
  if (input.event.livemode !== input.expectedLivemode) {
    throw new CreditTopupFulfillmentError(
      "CREDIT_TOPUP_MODE_MISMATCH",
      "Credit top-up event mode is invalid",
    )
  }

  const eventSession = input.event.data.object as Stripe.Checkout.Session
  const session = await input.gateway.retrieveCheckoutSession(eventSession.id)
  if (session.livemode !== input.expectedLivemode) {
    throw new CreditTopupFulfillmentError(
      "CREDIT_TOPUP_MODE_MISMATCH",
      "Credit top-up checkout mode is invalid",
    )
  }
  if (
    session.mode !== "payment" ||
    session.status !== "complete" ||
    session.payment_status !== "paid" ||
    session.metadata?.ams_offer !== "credit-topup"
  ) {
    throw new CreditTopupFulfillmentError(
      "CREDIT_TOPUP_SESSION_UNPAID",
      "Credit top-up checkout is not a completed paid session",
    )
  }

  const subject = requireStableSessionSubject(session)
  const pack = requirePack(session)
  const price = requireApprovedLineItem(session, pack)
  const paymentIntentId = requirePaymentIntentId(session)
  if (session.currency !== "usd" || session.amount_total !== pack.priceCents) {
    throw new CreditTopupFulfillmentError(
      "CREDIT_TOPUP_AMOUNT_INVALID",
      "Credit top-up total does not match the approved pack price",
    )
  }

  if (input.getEntitlements) {
    let snapshot: EntitlementSnapshot | null = null
    try {
      snapshot = await input.getEntitlements(subject)
    } catch {
      snapshot = null
    }
    if (requireActiveSubscriber(snapshot) === "ineligible") {
      if (!input.gateway.refundPaymentIntent) {
        throw new CreditTopupFulfillmentError(
          "CREDIT_TOPUP_REFUND_UNAVAILABLE",
          "Subscriber eligibility ended and automatic refund is unavailable",
          503,
        )
      }
      await input.gateway.refundPaymentIntent(
        paymentIntentId,
        ineligibleRefundIdempotencyKey(session.id),
      )
      return {
        pack: pack.slug,
        units: pack.units,
        applied: false,
        idempotent: false,
        refunded: true,
        topupCredits: null,
      }
    }
  }

  const grant = await input.grant({
    subject,
    units: pack.units,
    checkoutSessionId: session.id,
    paymentIntentId,
    stripePriceId: price.id,
    stripeEventId: input.event.id,
  })

  return {
    pack: pack.slug,
    units: pack.units,
    applied: grant.applied,
    idempotent: grant.idempotent,
    refunded: false,
    topupCredits: grant.topupCredits,
  }
}

function requireTopupPaymentIntent(paymentIntent: Stripe.PaymentIntent): {
  subject: string
  pack: CreditTopupPack
} {
  if (paymentIntent.metadata?.ams_offer !== "credit-topup") {
    throw new CreditTopupFulfillmentError(
      "CREDIT_TOPUP_NOT_APPLICABLE",
      "Payment is not an AMS credit top-up",
      404,
    )
  }
  const subject = paymentIntent.metadata?.customerSubject?.trim()
  const packSlug = paymentIntent.metadata?.topupPack
  if (!subject || !isStableCustomerSubject(subject) || !isCreditTopupPackSlug(packSlug)) {
    throw new CreditTopupFulfillmentError(
      "CREDIT_TOPUP_REVERSAL_METADATA_INVALID",
      "Credit top-up reversal metadata is invalid",
    )
  }
  const pack = creditTopupPack(packSlug)
  if (
    paymentIntent.metadata?.topupUnits !== String(pack.units) ||
    paymentIntent.metadata?.priceLookupKey !== pack.lookupKey
  ) {
    throw new CreditTopupFulfillmentError(
      "CREDIT_TOPUP_REVERSAL_METADATA_INVALID",
      "Credit top-up reversal metadata does not match an approved pack",
    )
  }
  return { subject, pack }
}

function proportionalUnits(amount: number, originalAmount: number, units: number): number {
  if (!Number.isSafeInteger(amount) || amount < 0 || !Number.isSafeInteger(originalAmount) || originalAmount < 1) {
    throw new CreditTopupFulfillmentError(
      "CREDIT_TOPUP_REVERSAL_AMOUNT_INVALID",
      "Credit top-up reversal amount is invalid",
    )
  }
  if (amount >= originalAmount) return units
  return Math.min(units, Math.floor((amount * units) / originalAmount))
}

export async function processCreditTopupReversal(input: {
  event: Stripe.Event
  gateway: Required<Pick<CreditTopupStripeGateway, "retrievePaymentIntent" | "retrieveCharge">>
  reconcile: CreditTopupReconcile
  expectedLivemode: boolean
}) {
  if (
    input.event.type !== "charge.refunded" &&
    input.event.type !== "charge.dispute.created" &&
    input.event.type !== "charge.dispute.closed"
  ) {
    throw new CreditTopupFulfillmentError(
      "CREDIT_TOPUP_EVENT_INVALID",
      "Unsupported credit top-up reversal event",
    )
  }
  if (input.event.livemode !== input.expectedLivemode) {
    throw new CreditTopupFulfillmentError(
      "CREDIT_TOPUP_MODE_MISMATCH",
      "Credit top-up reversal event mode is invalid",
    )
  }

  let charge: Stripe.Charge
  let source: CreditTopupReversalSource
  let reversedAmount: number

  if (input.event.type === "charge.refunded") {
    charge = input.event.data.object as Stripe.Charge
    source = "refund"
    reversedAmount = charge.amount_refunded
  } else {
    const dispute = input.event.data.object as Stripe.Dispute
    const chargeId = objectId(dispute.charge)
    if (!chargeId) {
      throw new CreditTopupFulfillmentError(
        "CREDIT_TOPUP_REVERSAL_CHARGE_MISSING",
        "Credit top-up dispute charge is missing",
      )
    }
    charge = await input.gateway.retrieveCharge(chargeId)
    source = "dispute"
    reversedAmount = input.event.type === "charge.dispute.closed" && dispute.status === "won"
      ? 0
      : dispute.amount
  }

  if (charge.livemode !== input.expectedLivemode) {
    throw new CreditTopupFulfillmentError(
      "CREDIT_TOPUP_MODE_MISMATCH",
      "Credit top-up charge mode is invalid",
    )
  }
  const paymentIntentId = objectId(charge.payment_intent)
  if (!paymentIntentId) {
    throw new CreditTopupFulfillmentError(
      "CREDIT_TOPUP_PAYMENT_INTENT_MISSING",
      "Credit top-up reversal payment intent is missing",
    )
  }

  const paymentIntent = await input.gateway.retrievePaymentIntent(paymentIntentId)
  if (paymentIntent.livemode !== input.expectedLivemode) {
    throw new CreditTopupFulfillmentError(
      "CREDIT_TOPUP_MODE_MISMATCH",
      "Credit top-up payment mode is invalid",
    )
  }
  const { subject, pack } = requireTopupPaymentIntent(paymentIntent)
  if (charge.currency !== "usd" || charge.amount !== pack.priceCents) {
    throw new CreditTopupFulfillmentError(
      "CREDIT_TOPUP_REVERSAL_AMOUNT_INVALID",
      "Credit top-up original charge does not match the approved pack",
    )
  }

  const targetUnits = proportionalUnits(reversedAmount, charge.amount, pack.units)
  const reconciliation = await input.reconcile({
    subject,
    units: pack.units,
    paymentIntentId,
    stripeEventId: input.event.id,
    source,
    targetUnits,
  })

  return {
    pack: pack.slug,
    units: pack.units,
    source,
    ...reconciliation,
  }
}

type Dependencies = {
  env: NodeJS.ProcessEnv
  createStripe: (key: string) => Stripe
  claimEvent: (eventId: string) => Promise<StripeEventClaim>
  completeEvent: (eventId: string, token: string) => Promise<void>
  releaseEvent: (eventId: string, token: string) => Promise<void>
  getEntitlements: (subject: string) => Promise<EntitlementSnapshot>
  grant: CreditTopupGrant
  reconcile: CreditTopupReconcile
}

export function createCreditTopupWebhookHandler(dependencies: Dependencies) {
  return async function tryCreditTopupWebhook(request: NextRequest): Promise<Response | null> {
    const signature = request.headers.get("stripe-signature")
    if (!signature) return null

    const secretKey = dependencies.env.STRIPE_SECRET_KEY?.trim()
    const webhookSecret = dependencies.env.STRIPE_WEBHOOK_SECRET?.trim()
    const webhookMode = (dependencies.env.AMS_STRIPE_WEBHOOK_MODE ?? "test").trim().toLowerCase()
    if (!secretKey || !webhookSecret) return null

    const rawBody = await request.text()
    const stripe = dependencies.createStripe(secretKey)
    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
    } catch {
      return null
    }

    const supported =
      event.type === "checkout.session.completed" ||
      event.type === "charge.refunded" ||
      event.type === "charge.dispute.created" ||
      event.type === "charge.dispute.closed"
    if (!supported) return null

    if (event.type === "checkout.session.completed") {
      const eventSession = event.data.object as Stripe.Checkout.Session
      if (eventSession.mode !== "payment" || eventSession.metadata?.ams_offer !== "credit-topup") {
        return null
      }
    }

    if (webhookMode !== "live" && webhookMode !== "test") {
      return NextResponse.json(
        { ok: false, error: "Credit top-up webhook mode is invalid", code: "CREDIT_TOPUP_MODE_INVALID" },
        { status: 503 },
      )
    }

    try {
      assertStripeSecretKeyMatchesMode(secretKey, dependencies.env)
    } catch {
      return NextResponse.json(
        { ok: false, error: "Credit top-up webhook mode is invalid", code: "CREDIT_TOPUP_MODE_INVALID" },
        { status: 503 },
      )
    }

    let claim: StripeEventClaim
    try {
      claim = await dependencies.claimEvent(event.id)
    } catch {
      return NextResponse.json(
        { ok: false, error: "Webhook event store unavailable", code: "EVENT_STORE_UNAVAILABLE" },
        { status: 503 },
      )
    }

    if (claim.state === "completed") {
      return NextResponse.json({ ok: true, received: true, processed: false, duplicate: true })
    }
    if (claim.state === "processing") {
      return NextResponse.json(
        { ok: false, error: "Webhook event is already processing", code: "EVENT_IN_PROGRESS" },
        { status: 503 },
      )
    }

    const expectedLivemode = webhookMode === "live"
    const gateway: CreditTopupStripeGateway = {
      retrieveCheckoutSession: (id) =>
        stripe.checkout.sessions.retrieve(id, {
          expand: ["line_items.data.price"],
        }),
      retrievePaymentIntent: (id) => stripe.paymentIntents.retrieve(id),
      retrieveCharge: (id) => stripe.charges.retrieve(id),
      refundPaymentIntent: (paymentIntentId, idempotencyKey) =>
        stripe.refunds.create({ payment_intent: paymentIntentId }, { idempotencyKey }),
    }

    try {
      const result = event.type === "checkout.session.completed"
        ? await processCreditTopupCheckout({
            event,
            gateway,
            grant: dependencies.grant,
            getEntitlements: dependencies.getEntitlements,
            expectedLivemode,
          })
        : await processCreditTopupReversal({
            event,
            gateway: {
              retrievePaymentIntent: gateway.retrievePaymentIntent!,
              retrieveCharge: gateway.retrieveCharge!,
            },
            reconcile: dependencies.reconcile,
            expectedLivemode,
          })

      await dependencies.completeEvent(event.id, claim.token)
      console.info(`[Stripe] Processed ${event.type} for AMS credit top-up`)
      return NextResponse.json({ ok: true, received: true, processed: true, ...result })
    } catch (error) {
      await dependencies.releaseEvent(event.id, claim.token).catch(() => undefined)
      if (
        error instanceof CreditTopupFulfillmentError &&
        error.code === "CREDIT_TOPUP_NOT_APPLICABLE"
      ) {
        return null
      }
      const status = error instanceof CreditTopupFulfillmentError ? error.httpStatus : 500
      const code =
        error instanceof CreditTopupFulfillmentError
          ? error.code
          : "CREDIT_TOPUP_FULFILLMENT_FAILED"
      console.error(`[Stripe] Credit top-up fulfillment failed for ${event.type}`)
      return NextResponse.json(
        { ok: false, error: "Credit top-up fulfillment failed", code },
        { status },
      )
    }
  }
}

export function defaultCreditTopupWebhookDependencies(input: {
  env: NodeJS.ProcessEnv
  claimEvent: Dependencies["claimEvent"]
  completeEvent: Dependencies["completeEvent"]
  releaseEvent: Dependencies["releaseEvent"]
}): Dependencies {
  return {
    ...input,
    createStripe: (key) => new Stripe(key),
    getEntitlements: getEntitlementSnapshot,
    grant: grantCreditTopupOnce,
    reconcile: reconcileCreditTopupReversal,
  }
}
