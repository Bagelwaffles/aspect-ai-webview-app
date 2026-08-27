import assert from "node:assert/strict"
import test from "node:test"

import type Stripe from "stripe"

import { customerSubjectFromProviderSubject } from "../lib/auth"
import { creditTopupPack } from "../lib/credit-topups"
import {
  CreditTopupFulfillmentError,
  processCreditTopupCheckout,
  processCreditTopupReversal,
} from "../lib/server/credit-topup-webhook"
import type { EntitlementSnapshot } from "../lib/server/entitlements"

const subject = customerSubjectFromProviderSubject("credit-topup-webhook")
const otherSubject = customerSubjectFromProviderSubject("credit-topup-other")
if (!subject || !otherSubject) throw new Error("Stable test subjects are required")

function entitlement(status: EntitlementSnapshot["subscriptionStatus"]): EntitlementSnapshot {
  const active = status === "active" || status === "trialing"
  return {
    configured: true,
    subject,
    billingEmail: "buyer@example.com",
    plan: active ? "starter" : null,
    subscriptionStatus: status,
    planCredits: active ? 20 : 0,
    topupCredits: 5,
    totalCredits: active ? 25 : 5,
    agentSlugs: [],
    stripeCustomerId: "cus_topup_fixture",
    stripeSubscriptionId: active ? "sub_topup_fixture" : null,
  }
}

function approvedPrice(packSlug: "100" | "300" | "1000"): Stripe.Price {
  const pack = creditTopupPack(packSlug)
  return {
    id: `price_${packSlug}_approved`,
    object: "price",
    active: true,
    currency: "usd",
    lookup_key: pack.lookupKey,
    metadata: {
      offer_type: "credit_topup",
      topup_units: String(pack.units),
      subscriber_only: "true",
      non_expiring: "true",
    },
    recurring: null,
    type: "one_time",
    unit_amount: pack.priceCents,
  } as unknown as Stripe.Price
}

function session(input: {
  pack?: "100" | "300" | "1000"
  paymentStatus?: Stripe.Checkout.Session.PaymentStatus
  status?: Stripe.Checkout.Session.Status
  metadataSubject?: string
  referenceSubject?: string
  amountTotal?: number
  price?: Stripe.Price
  livemode?: boolean
  paymentIntentId?: string | null
} = {}): Stripe.Checkout.Session {
  const pack = creditTopupPack(input.pack ?? "300")
  const price = input.price ?? approvedPrice(pack.slug)
  return {
    id: "cs_topup_fixture",
    object: "checkout.session",
    livemode: input.livemode ?? false,
    mode: "payment",
    payment_status: input.paymentStatus ?? "paid",
    status: input.status ?? "complete",
    currency: "usd",
    amount_total: input.amountTotal ?? pack.priceCents,
    payment_intent: input.paymentIntentId === null ? null : input.paymentIntentId ?? "pi_topup_fixture",
    client_reference_id: input.referenceSubject ?? subject,
    metadata: {
      ams_offer: "credit-topup",
      customerSubject: input.metadataSubject ?? subject,
      userEmail: "buyer@example.com",
      topupPack: pack.slug,
      topupUnits: String(pack.units),
      priceLookupKey: pack.lookupKey,
    },
    line_items: {
      object: "list",
      data: [
        {
          id: "li_topup_fixture",
          object: "item",
          amount_discount: 0,
          amount_subtotal: pack.priceCents,
          amount_tax: 0,
          amount_total: pack.priceCents,
          currency: "usd",
          description: `AMS Credit Top-Up — ${pack.units}`,
          discounts: [],
          price,
          quantity: 1,
          taxes: [],
        } as unknown as Stripe.LineItem,
      ],
      has_more: false,
      url: "/v1/checkout/sessions/cs_topup_fixture/line_items",
    },
  } as unknown as Stripe.Checkout.Session
}

function checkoutEvent(checkout: Stripe.Checkout.Session, livemode = false): Stripe.Event {
  return eventOf("checkout.session.completed", checkout, "evt_credit_topup_fixture", livemode)
}

function eventOf(type: string, object: unknown, id: string, livemode = false): Stripe.Event {
  return {
    id,
    object: "event",
    api_version: "2026-06-24.preview",
    created: 123,
    data: { object },
    livemode,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
  } as unknown as Stripe.Event
}

function paymentIntent(packSlug: "100" | "300" | "1000" = "300"): Stripe.PaymentIntent {
  const pack = creditTopupPack(packSlug)
  return {
    id: "pi_topup_fixture",
    object: "payment_intent",
    livemode: false,
    metadata: {
      ams_offer: "credit-topup",
      customerSubject: subject,
      userEmail: "buyer@example.com",
      topupPack: pack.slug,
      topupUnits: String(pack.units),
      priceLookupKey: pack.lookupKey,
    },
  } as unknown as Stripe.PaymentIntent
}

function charge(input: {
  pack?: "100" | "300" | "1000"
  amountRefunded?: number
  livemode?: boolean
} = {}): Stripe.Charge {
  const pack = creditTopupPack(input.pack ?? "300")
  return {
    id: "ch_topup_fixture",
    object: "charge",
    livemode: input.livemode ?? false,
    amount: pack.priceCents,
    amount_refunded: input.amountRefunded ?? 0,
    currency: "usd",
    payment_intent: "pi_topup_fixture",
  } as unknown as Stripe.Charge
}

function dispute(status: string, amount = 4_900): Stripe.Dispute {
  return {
    id: "dp_topup_fixture",
    object: "dispute",
    amount,
    charge: "ch_topup_fixture",
    status,
  } as unknown as Stripe.Dispute
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(
    promise,
    (error: unknown) =>
      error instanceof CreditTopupFulfillmentError && error.code === code,
  )
}

test("paid exact pack grants only the verified top-up units", async () => {
  const checkout = session({ pack: "300" })
  const grants: Array<{
    subject: string
    units: number
    checkoutSessionId: string
    paymentIntentId: string
    stripePriceId: string
    stripeEventId: string
  }> = []

  const result = await processCreditTopupCheckout({
    event: checkoutEvent(checkout),
    gateway: { retrieveCheckoutSession: async () => checkout },
    grant: async (input) => {
      grants.push(input)
      return { applied: true, idempotent: false, topupCredits: 325 }
    },
    getEntitlements: async () => entitlement("active"),
    expectedLivemode: false,
  })

  assert.deepEqual(grants, [
    {
      subject,
      units: 300,
      checkoutSessionId: "cs_topup_fixture",
      paymentIntentId: "pi_topup_fixture",
      stripePriceId: "price_300_approved",
      stripeEventId: "evt_credit_topup_fixture",
    },
  ])
  assert.deepEqual(result, {
    pack: "300",
    units: 300,
    applied: true,
    idempotent: false,
    refunded: false,
    topupCredits: 325,
  })
})

test("subscriber who becomes ineligible before fulfillment is refunded and receives no credits", async () => {
  const checkout = session({ pack: "100" })
  const refunds: Array<{ paymentIntentId: string; idempotencyKey: string }> = []
  let grantCalls = 0

  const result = await processCreditTopupCheckout({
    event: checkoutEvent(checkout),
    gateway: {
      retrieveCheckoutSession: async () => checkout,
      refundPaymentIntent: async (paymentIntentId, idempotencyKey) => {
        refunds.push({ paymentIntentId, idempotencyKey })
        return { id: "re_ineligible_fixture", object: "refund" } as unknown as Stripe.Refund
      },
    },
    grant: async () => {
      grantCalls += 1
      return { applied: true, idempotent: false, topupCredits: 100 }
    },
    getEntitlements: async () => entitlement("canceled"),
    expectedLivemode: false,
  })

  assert.equal(grantCalls, 0)
  assert.equal(result.refunded, true)
  assert.equal(result.applied, false)
  assert.equal(result.topupCredits, null)
  assert.equal(refunds.length, 1)
  assert.equal(refunds[0].paymentIntentId, "pi_topup_fixture")
  assert.match(refunds[0].idempotencyKey, /^ams-topup-ineligible-refund-[a-f0-9]{64}$/)
})

test("entitlement lookup failure is retried instead of granting or assuming eligibility", async () => {
  const checkout = session({ pack: "100" })
  let grantCalls = 0

  await expectCode(
    processCreditTopupCheckout({
      event: checkoutEvent(checkout),
      gateway: { retrieveCheckoutSession: async () => checkout },
      grant: async () => {
        grantCalls += 1
        return { applied: true, idempotent: false, topupCredits: 100 }
      },
      getEntitlements: async () => {
        throw new Error("redis unavailable")
      },
      expectedLivemode: false,
    }),
    "CREDIT_TOPUP_ENTITLEMENTS_UNAVAILABLE",
  )

  assert.equal(grantCalls, 0)
})

test("fulfillment surfaces idempotent session replay without another credit grant", async () => {
  const checkout = session({ pack: "100" })
  const result = await processCreditTopupCheckout({
    event: checkoutEvent(checkout),
    gateway: { retrieveCheckoutSession: async () => checkout },
    grant: async () => ({ applied: false, idempotent: true, topupCredits: 100 }),
    getEntitlements: async () => entitlement("active"),
    expectedLivemode: false,
  })

  assert.equal(result.applied, false)
  assert.equal(result.idempotent, true)
  assert.equal(result.refunded, false)
  assert.equal(result.topupCredits, 100)
})

test("unpaid, incorrect amount, missing payment intent, or forged price metadata never grants credits", async () => {
  let grantCalls = 0
  const grant = async () => {
    grantCalls += 1
    return { applied: true, idempotent: false, topupCredits: 999_999 }
  }

  const unpaid = session({ paymentStatus: "unpaid" })
  await expectCode(
    processCreditTopupCheckout({
      event: checkoutEvent(unpaid),
      gateway: { retrieveCheckoutSession: async () => unpaid },
      grant,
      expectedLivemode: false,
    }),
    "CREDIT_TOPUP_SESSION_UNPAID",
  )

  const wrongAmount = session({ amountTotal: 1 })
  await expectCode(
    processCreditTopupCheckout({
      event: checkoutEvent(wrongAmount),
      gateway: { retrieveCheckoutSession: async () => wrongAmount },
      grant,
      expectedLivemode: false,
    }),
    "CREDIT_TOPUP_AMOUNT_INVALID",
  )

  const noPaymentIntent = session({ paymentIntentId: null })
  await expectCode(
    processCreditTopupCheckout({
      event: checkoutEvent(noPaymentIntent),
      gateway: { retrieveCheckoutSession: async () => noPaymentIntent },
      grant,
      expectedLivemode: false,
    }),
    "CREDIT_TOPUP_PAYMENT_INTENT_MISSING",
  )

  const forgedPrice = approvedPrice("300")
  forgedPrice.metadata = { ...forgedPrice.metadata, topup_units: "1000" }
  const wrongPrice = session({ price: forgedPrice })
  await expectCode(
    processCreditTopupCheckout({
      event: checkoutEvent(wrongPrice),
      gateway: { retrieveCheckoutSession: async () => wrongPrice },
      grant,
      expectedLivemode: false,
    }),
    "CREDIT_TOPUP_PRICE_INVALID",
  )

  assert.equal(grantCalls, 0)
})

test("mismatched stable customer identity is rejected before granting credits", async () => {
  const checkout = session({ metadataSubject: subject, referenceSubject: otherSubject })
  let grantCalls = 0

  await expectCode(
    processCreditTopupCheckout({
      event: checkoutEvent(checkout),
      gateway: { retrieveCheckoutSession: async () => checkout },
      grant: async () => {
        grantCalls += 1
        return { applied: true, idempotent: false, topupCredits: 300 }
      },
      expectedLivemode: false,
    }),
    "CREDIT_TOPUP_SUBJECT_INVALID",
  )

  assert.equal(grantCalls, 0)
})

test("event and retrieved session must match the configured Stripe mode", async () => {
  const checkout = session({ livemode: true })

  await expectCode(
    processCreditTopupCheckout({
      event: checkoutEvent(checkout, true),
      gateway: { retrieveCheckoutSession: async () => checkout },
      grant: async () => ({ applied: true, idempotent: false, topupCredits: 300 }),
      expectedLivemode: false,
    }),
    "CREDIT_TOPUP_MODE_MISMATCH",
  )
})

test("partial refund reconciles the proportional number of purchased credits", async () => {
  const originalCharge = charge({ pack: "300", amountRefunded: 2_450 })
  const pi = paymentIntent("300")
  const reconciliations: unknown[] = []

  const result = await processCreditTopupReversal({
    event: eventOf("charge.refunded", originalCharge, "evt_refund_fixture"),
    gateway: {
      retrievePaymentIntent: async () => pi,
      retrieveCharge: async () => originalCharge,
    },
    reconcile: async (input) => {
      reconciliations.push(input)
      return {
        found: true,
        applied: true,
        idempotent: false,
        topupCredits: 25,
        planCredits: 20,
        targetUnits: 150,
        withheldUnits: 150,
        unrecoveredUnits: 0,
      }
    },
    expectedLivemode: false,
  })

  assert.deepEqual(reconciliations, [
    {
      subject,
      units: 300,
      paymentIntentId: "pi_topup_fixture",
      stripeEventId: "evt_refund_fixture",
      source: "refund",
      targetUnits: 150,
    },
  ])
  assert.equal(result.source, "refund")
  assert.equal(result.targetUnits, 150)
  assert.equal(result.withheldUnits, 150)
})

test("won dispute clears the dispute target so previously withheld credits can be restored", async () => {
  const originalCharge = charge({ pack: "300" })
  const pi = paymentIntent("300")
  const inputs: unknown[] = []

  const result = await processCreditTopupReversal({
    event: eventOf("charge.dispute.closed", dispute("won"), "evt_dispute_won_fixture"),
    gateway: {
      retrievePaymentIntent: async () => pi,
      retrieveCharge: async () => originalCharge,
    },
    reconcile: async (input) => {
      inputs.push(input)
      return {
        found: true,
        applied: true,
        idempotent: false,
        topupCredits: 300,
        planCredits: 20,
        targetUnits: 0,
        withheldUnits: 0,
        unrecoveredUnits: 0,
      }
    },
    expectedLivemode: false,
  })

  assert.deepEqual(inputs, [
    {
      subject,
      units: 300,
      paymentIntentId: "pi_topup_fixture",
      stripeEventId: "evt_dispute_won_fixture",
      source: "dispute",
      targetUnits: 0,
    },
  ])
  assert.equal(result.source, "dispute")
  assert.equal(result.targetUnits, 0)
})

test("unrelated PaymentIntent metadata is ignored by the top-up reversal processor", async () => {
  const originalCharge = charge({ pack: "300", amountRefunded: 4_900 })
  const pi = paymentIntent("300")
  pi.metadata = { ...pi.metadata, ams_offer: "something-else" }

  await expectCode(
    processCreditTopupReversal({
      event: eventOf("charge.refunded", originalCharge, "evt_unrelated_refund"),
      gateway: {
        retrievePaymentIntent: async () => pi,
        retrieveCharge: async () => originalCharge,
      },
      reconcile: async () => {
        throw new Error("should not reconcile")
      },
      expectedLivemode: false,
    }),
    "CREDIT_TOPUP_NOT_APPLICABLE",
  )
})
