import assert from "node:assert/strict"
import test from "node:test"

import type Stripe from "stripe"

import { customerSubjectFromProviderSubject } from "../lib/auth"
import { creditTopupPack } from "../lib/credit-topups"
import {
  CreditTopupFulfillmentError,
  processCreditTopupCheckout,
} from "../lib/server/credit-topup-webhook"

const subject = customerSubjectFromProviderSubject("credit-topup-webhook")
const otherSubject = customerSubjectFromProviderSubject("credit-topup-other")
if (!subject || !otherSubject) throw new Error("Stable test subjects are required")

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

function event(checkout: Stripe.Checkout.Session, livemode = false): Stripe.Event {
  return {
    id: "evt_credit_topup_fixture",
    object: "event",
    api_version: "2026-06-24.preview",
    created: 123,
    data: { object: checkout },
    livemode,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: "checkout.session.completed",
  } as unknown as Stripe.Event
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
    stripePriceId: string
    stripeEventId: string
  }> = []

  const result = await processCreditTopupCheckout({
    event: event(checkout),
    gateway: { retrieveCheckoutSession: async () => checkout },
    grant: async (input) => {
      grants.push(input)
      return { applied: true, idempotent: false, topupCredits: 325 }
    },
    expectedLivemode: false,
  })

  assert.deepEqual(grants, [
    {
      subject,
      units: 300,
      checkoutSessionId: "cs_topup_fixture",
      stripePriceId: "price_300_approved",
      stripeEventId: "evt_credit_topup_fixture",
    },
  ])
  assert.deepEqual(result, {
    pack: "300",
    units: 300,
    applied: true,
    idempotent: false,
    topupCredits: 325,
  })
})

test("fulfillment surfaces idempotent session replay without another credit grant", async () => {
  const checkout = session({ pack: "100" })
  const result = await processCreditTopupCheckout({
    event: event(checkout),
    gateway: { retrieveCheckoutSession: async () => checkout },
    grant: async () => ({ applied: false, idempotent: true, topupCredits: 100 }),
    expectedLivemode: false,
  })

  assert.equal(result.applied, false)
  assert.equal(result.idempotent, true)
  assert.equal(result.topupCredits, 100)
})

test("unpaid, incorrect amount, or forged price metadata never grants credits", async () => {
  let grantCalls = 0
  const grant = async () => {
    grantCalls += 1
    return { applied: true, idempotent: false, topupCredits: 999_999 }
  }

  const unpaid = session({ paymentStatus: "unpaid" })
  await expectCode(
    processCreditTopupCheckout({
      event: event(unpaid),
      gateway: { retrieveCheckoutSession: async () => unpaid },
      grant,
      expectedLivemode: false,
    }),
    "CREDIT_TOPUP_SESSION_UNPAID",
  )

  const wrongAmount = session({ amountTotal: 1 })
  await expectCode(
    processCreditTopupCheckout({
      event: event(wrongAmount),
      gateway: { retrieveCheckoutSession: async () => wrongAmount },
      grant,
      expectedLivemode: false,
    }),
    "CREDIT_TOPUP_AMOUNT_INVALID",
  )

  const forgedPrice = approvedPrice("300")
  forgedPrice.metadata = { ...forgedPrice.metadata, topup_units: "1000" }
  const wrongPrice = session({ price: forgedPrice })
  await expectCode(
    processCreditTopupCheckout({
      event: event(wrongPrice),
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
      event: event(checkout),
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
      event: event(checkout, true),
      gateway: { retrieveCheckoutSession: async () => checkout },
      grant: async () => ({ applied: true, idempotent: false, topupCredits: 300 }),
      expectedLivemode: false,
    }),
    "CREDIT_TOPUP_MODE_MISMATCH",
  )
})
