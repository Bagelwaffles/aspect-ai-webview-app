import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

import {
  creditTopupPack,
  isCreditTopupPackSlug,
  type CreditTopupPack,
} from "../credit-topups"
import { isStableCustomerSubject } from "../auth"
import type { StripeEventClaim } from "./entitlements"
import {
  grantCreditTopupOnce,
  type CreditTopupGrantInput,
  type CreditTopupGrantResult,
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
}

export type CreditTopupGrant = (
  input: CreditTopupGrantInput,
) => Promise<CreditTopupGrantResult>

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
    price.metadata?.subscriber_only !== "true"
  ) {
    throw new CreditTopupFulfillmentError(
      "CREDIT_TOPUP_PRICE_INVALID",
      "Credit top-up price is not an approved pack",
    )
  }

  return price
}

export async function processCreditTopupCheckout(input: {
  event: Stripe.Event
  gateway: CreditTopupStripeGateway
  grant: CreditTopupGrant
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
  if (session.currency !== "usd" || session.amount_total !== pack.priceCents) {
    throw new CreditTopupFulfillmentError(
      "CREDIT_TOPUP_AMOUNT_INVALID",
      "Credit top-up total does not match the approved pack price",
    )
  }

  const grant = await input.grant({
    subject,
    units: pack.units,
    checkoutSessionId: session.id,
    stripePriceId: price.id,
    stripeEventId: input.event.id,
  })

  return {
    pack: pack.slug,
    units: pack.units,
    applied: grant.applied,
    idempotent: grant.idempotent,
    topupCredits: grant.topupCredits,
  }
}

type Dependencies = {
  env: NodeJS.ProcessEnv
  createStripe: (key: string) => Stripe
  claimEvent: (eventId: string) => Promise<StripeEventClaim>
  completeEvent: (eventId: string, token: string) => Promise<void>
  releaseEvent: (eventId: string, token: string) => Promise<void>
  grant: CreditTopupGrant
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

    if (event.type !== "checkout.session.completed") return null
    const eventSession = event.data.object as Stripe.Checkout.Session
    if (eventSession.mode !== "payment" || eventSession.metadata?.ams_offer !== "credit-topup") {
      return null
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

    try {
      const result = await processCreditTopupCheckout({
        event,
        gateway: {
          retrieveCheckoutSession: (id) =>
            stripe.checkout.sessions.retrieve(id, {
              expand: ["line_items.data.price"],
            }),
        },
        grant: dependencies.grant,
        expectedLivemode: webhookMode === "live",
      })
      await dependencies.completeEvent(event.id, claim.token)
      console.info(`[Stripe] Processed ${event.type} for ${result.units} AMS top-up credits`)
      return NextResponse.json({ ok: true, received: true, processed: true, ...result })
    } catch (error) {
      await dependencies.releaseEvent(event.id, claim.token).catch(() => undefined)
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
    grant: grantCreditTopupOnce,
  }
}
