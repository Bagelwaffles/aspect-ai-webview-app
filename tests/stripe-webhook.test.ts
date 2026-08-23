import assert from "node:assert/strict"
import test from "node:test"

import { NextRequest } from "next/server"
import Stripe from "stripe"

import { customerSubjectFromProviderSubject } from "../lib/auth"
import { monthlyCreditsForPlan } from "../lib/server/plan-credits"
import {
  createStripeWebhookPostHandler,
  decideStripeEntitlementTransition,
  processStripeLifecycleEvent,
  type StoredStripeEntitlementState,
  type StripeEntitlementApplyResult,
  type StripeEntitlementConfig,
  type StripeEntitlementMutation,
  type StripeEntitlementWriter,
  StripeFulfillmentError,
  type StripeReadGateway,
  type StripeSubscriptionRevocation,
} from "../lib/server/stripe-entitlements"
import type { StripeEventClaim } from "../lib/server/entitlements"

const webhookSecret = "whsec_test_fixture_only"
const stripeSecret = "sk_test_fixture_only"
const approvedPrice = "price_starter_approved"
const accountEmail = "billing@example.com"
const accountSubject = customerSubjectFromProviderSubject("stripe-account-primary")
const secondarySubject = customerSubjectFromProviderSubject("stripe-account-secondary")
if (!accountSubject || !secondarySubject) throw new Error("Stable test subjects are required")

function price(id = approvedPrice, recurring = true): Stripe.Price {
  return {
    id,
    object: "price",
    recurring: recurring
      ? {
          aggregate_usage: null,
          interval: "month",
          interval_count: 1,
          meter: null,
          trial_period_days: null,
          usage_type: "licensed",
        }
      : null,
  } as unknown as Stripe.Price
}

function subscription(input: {
  id?: string
  status?: Stripe.Subscription.Status
  created?: number
  periodStart?: number
  priceId?: string
  recurring?: boolean
  livemode?: boolean
  email?: string
  subject?: string
} = {}): Stripe.Subscription {
  return {
    id: input.id ?? "sub_primary",
    object: "subscription",
    status: input.status ?? "trialing",
    created: input.created ?? 100,
    current_period_start: input.periodStart ?? 100,
    current_period_end: (input.periodStart ?? 100) + 2_592_000,
    livemode: input.livemode ?? false,
    customer: "cus_fixture",
    metadata: {
      customerSubject: input.subject ?? accountSubject,
      userEmail: input.email ?? accountEmail,
      plan: "pro",
    },
    items: {
      object: "list",
      data: [
        {
          id: "si_fixture",
          object: "subscription_item",
          price: price(input.priceId, input.recurring ?? true),
          quantity: 1,
        } as Stripe.SubscriptionItem,
      ],
      has_more: false,
      url: "/v1/subscription_items",
    },
  } as unknown as Stripe.Subscription
}

function checkoutSession(input: {
  mode?: Stripe.Checkout.Session.Mode
  paymentStatus?: Stripe.Checkout.Session.PaymentStatus
  status?: Stripe.Checkout.Session.Status
  subscriptionId?: string | null
  livemode?: boolean
  subject?: string
  metadataSubject?: string | null
  clientReferenceId?: string | null
} = {}): Stripe.Checkout.Session {
  const subject = input.subject ?? accountSubject
  return {
    id: "cs_fixture",
    object: "checkout.session",
    mode: input.mode ?? "subscription",
    payment_status: input.paymentStatus ?? "no_payment_required",
    status: input.status ?? "complete",
    subscription:
      input.subscriptionId === null ? null : input.subscriptionId ?? "sub_primary",
    livemode: input.livemode ?? false,
    client_reference_id:
      input.clientReferenceId === undefined ? subject : input.clientReferenceId,
    customer_email: accountEmail,
    customer_details: { email: accountEmail },
    metadata: {
      customerSubject:
        input.metadataSubject === undefined ? subject : input.metadataSubject ?? "",
      userEmail: accountEmail,
      plan: "pro",
      topupCredits: "99999",
      agentSlug: "admin",
    },
  } as unknown as Stripe.Checkout.Session
}

function invoice(input: {
  id?: string
  subscriptionId?: string | null
  paid?: boolean
  status?: Stripe.Invoice.Status
  billingReason?: Stripe.Invoice.BillingReason
  livemode?: boolean
} = {}): Stripe.Invoice {
  return {
    id: input.id ?? "in_fixture",
    object: "invoice",
    subscription:
      input.subscriptionId === null ? null : input.subscriptionId ?? "sub_primary",
    paid: input.paid ?? true,
    status: input.status ?? "paid",
    billing_reason: input.billingReason ?? "subscription_cycle",
    livemode: input.livemode ?? false,
    customer_email: accountEmail,
  } as unknown as Stripe.Invoice
}

function stripeEvent(
  type: Stripe.Event.Type,
  object: object,
  input: { id?: string; created?: number; livemode?: boolean } = {},
): Stripe.Event {
  return {
    id: input.id ?? `evt_${type.replaceAll(".", "_")}`,
    object: "event",
    api_version: "2023-10-16",
    created: input.created ?? 200,
    data: { object },
    livemode: input.livemode ?? false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
  } as Stripe.Event
}

class FakeGateway implements StripeReadGateway {
  readonly sessions = new Map<string, Stripe.Checkout.Session>()
  readonly subscriptions = new Map<string, Stripe.Subscription>()

  async retrieveCheckoutSession(id: string) {
    const record = this.sessions.get(id)
    if (!record) throw new Error("missing checkout fixture")
    return record
  }

  async retrieveSubscription(id: string) {
    const record = this.subscriptions.get(id)
    if (!record) throw new Error("missing subscription fixture")
    return record
  }

  async retrieveCustomer(id: string) {
    return {
      id,
      object: "customer",
      email: accountEmail,
      deleted: false,
    } as unknown as Stripe.Customer
  }
}

class MemoryEntitlementWriter implements StripeEntitlementWriter {
  readonly states = new Map<string, StoredStripeEntitlementState>()
  readonly subscriptionOwners = new Map<string, string>()
  readonly mutations: StripeEntitlementMutation[] = []
  resetCount = 0

  async apply(input: StripeEntitlementMutation): Promise<StripeEntitlementApplyResult> {
    const mappedSubject = this.subscriptionOwners.get(input.stripeSubscriptionId)
    if (mappedSubject && mappedSubject !== input.subject) {
      throw new StripeFulfillmentError(
        "STRIPE_SUBSCRIPTION_OWNER_CONFLICT",
        "simulated immutable ownership conflict",
      )
    }
    this.subscriptionOwners.set(input.stripeSubscriptionId, input.subject)
    const key = input.subject
    this.mutations.push(input)
    const decision = decideStripeEntitlementTransition(this.states.get(key) ?? null, input)
    if (decision.applied) {
      this.states.set(key, decision.next)
      if (decision.creditsReset) this.resetCount += 1
    }
    return decision
  }

  async revoke(input: StripeSubscriptionRevocation): Promise<StripeEntitlementApplyResult> {
    const subject = this.subscriptionOwners.get(input.stripeSubscriptionId)
    if (!subject) {
      throw new StripeFulfillmentError(
        "STRIPE_SUBSCRIPTION_OWNER_MISSING",
        "simulated missing immutable ownership",
      )
    }
    const current = this.states.get(subject)
    if (!current || current.stripeSubscriptionId !== input.stripeSubscriptionId) {
      return {
        applied: false,
        idempotent: false,
        creditsReset: false,
        reason: "UNRELATED_SUBSCRIPTION",
      }
    }
    if (current.stripeLastEventId === input.stripeEventId) {
      return { applied: false, idempotent: true, creditsReset: false, reason: "IDEMPOTENT" }
    }
    if (current.subscriptionStatus === "canceled") {
      return {
        applied: false,
        idempotent: false,
        creditsReset: false,
        reason: "TERMINAL_SUBSCRIPTION",
      }
    }
    if (
      input.stripeEventCreated < current.stripeLastEventCreated &&
      input.subscriptionStatus !== "canceled"
    ) {
      return {
        applied: false,
        idempotent: false,
        creditsReset: false,
        reason: "STALE_EVENT",
      }
    }

    this.states.set(subject, {
      ...current,
      subscriptionStatus: input.subscriptionStatus,
      stripeLastEventId: input.stripeEventId,
      stripeLastEventCreated: Math.max(current.stripeLastEventCreated, input.stripeEventCreated),
    })
    return { applied: true, idempotent: false, creditsReset: false, reason: "APPLIED" }
  }
}

class MemoryClaimStore {
  readonly states = new Map<string, "processing" | "done">()
  failClaim = false
  failCompleteOnce = false
  processCount = 0

  async claim(eventId: string): Promise<StripeEventClaim> {
    if (this.failClaim) throw new Error("simulated event store outage")
    const state = this.states.get(eventId)
    if (state === "done") return { state: "completed" }
    if (state === "processing") return { state: "processing" }
    this.states.set(eventId, "processing")
    return { state: "claimed", token: `token-${eventId}` }
  }

  async complete(eventId: string, token: string) {
    assert.equal(token, `token-${eventId}`)
    assert.equal(this.states.get(eventId), "processing")
    if (this.failCompleteOnce) {
      this.failCompleteOnce = false
      throw new Error("simulated completion marker outage")
    }
    this.states.set(eventId, "done")
  }

  async release(eventId: string, token: string) {
    assert.equal(token, `token-${eventId}`)
    if (this.states.get(eventId) === "processing") this.states.delete(eventId)
  }
}

function config(expectedLivemode = false): StripeEntitlementConfig {
  return {
    expectedLivemode,
    priceToPlan: new Map([[approvedPrice, "starter"]]),
  }
}

function signedRequest(stripe: Stripe, event: Stripe.Event, signatureOverride?: string) {
  const payload = JSON.stringify(event)
  const signature =
    signatureOverride ??
    stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
      timestamp: 1_800_000_000,
    })
  return new NextRequest("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body: payload,
  })
}

function webhookFixture() {
  const signatureStripe = new Stripe(stripeSecret)
  const gateway = new FakeGateway()
  const writer = new MemoryEntitlementWriter()
  const claims = new MemoryClaimStore()
  const env = {
    NODE_ENV: "test",
    STRIPE_SECRET_KEY: stripeSecret,
    STRIPE_WEBHOOK_SECRET: webhookSecret,
    AMS_STRIPE_WEBHOOK_MODE: "test",
    AMS_STRIPE_STARTER_PRICE_ID: approvedPrice,
  } as unknown as NodeJS.ProcessEnv

  const handler = createStripeWebhookPostHandler({
    env,
    isStoreConfigured: () => true,
    createStripe: () => signatureStripe,
    claimEvent: (eventId) => claims.claim(eventId),
    completeEvent: (eventId, token) => claims.complete(eventId, token),
    releaseEvent: (eventId, token) => claims.release(eventId, token),
    processEvent: async (_stripe, event, entitlementConfig) => {
      claims.processCount += 1
      return processStripeLifecycleEvent({ event, gateway, writer, config: entitlementConfig })
    },
  })

  return { claims, env, gateway, handler, signatureStripe, writer }
}

test("verifies signatures before claiming an event", async () => {
  const fixture = webhookFixture()
  const event = stripeEvent("checkout.session.completed", checkoutSession({ mode: "payment" }))
  const response = await fixture.handler(signedRequest(fixture.signatureStripe, event, "invalid"))

  assert.equal(response.status, 400)
  assert.equal(fixture.claims.states.size, 0)
  assert.equal(fixture.claims.processCount, 0)
})

test("rejects a Stripe secret key that does not match the configured webhook mode", async () => {
  const fixture = webhookFixture()
  fixture.env.STRIPE_SECRET_KEY = "sk_live_fixture_only"
  const event = stripeEvent("checkout.session.completed", checkoutSession({ mode: "payment" }))

  const response = await fixture.handler(signedRequest(fixture.signatureStripe, event))

  assert.equal(response.status, 503)
  assert.equal(fixture.claims.states.size, 0)
  assert.equal(fixture.claims.processCount, 0)
})

test("signed payment-mode checkout grants no plan, agent, or top-up entitlement", async () => {
  const fixture = webhookFixture()
  const event = stripeEvent("checkout.session.completed", checkoutSession({ mode: "payment" }))
  const response = await fixture.handler(signedRequest(fixture.signatureStripe, event))
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.processed, false)
  assert.equal(body.reason, "NON_SUBSCRIPTION_CHECKOUT_IGNORED")
  assert.equal(fixture.writer.mutations.length, 0)
  assert.equal(fixture.writer.states.size, 0)
})

test("claim-store failures and in-flight claims return 503 rather than duplicate 200", async () => {
  const failed = webhookFixture()
  failed.claims.failClaim = true
  const event = stripeEvent("checkout.session.completed", checkoutSession({ mode: "payment" }))
  const failureResponse = await failed.handler(signedRequest(failed.signatureStripe, event))
  assert.equal(failureResponse.status, 503)
  assert.equal((await failureResponse.json()).code, "EVENT_STORE_UNAVAILABLE")

  const busy = webhookFixture()
  busy.claims.states.set(event.id, "processing")
  const busyResponse = await busy.handler(signedRequest(busy.signatureStripe, event))
  assert.equal(busyResponse.status, 503)
  assert.equal((await busyResponse.json()).code, "EVENT_IN_PROGRESS")
  assert.equal(busy.claims.processCount, 0)
})

test("approved recurring price controls the plan and completed-event replay is idempotent", async () => {
  const fixture = webhookFixture()
  const session = checkoutSession()
  const activeSubscription = subscription({ status: "trialing" })
  fixture.gateway.sessions.set(session.id, session)
  fixture.gateway.subscriptions.set(activeSubscription.id, activeSubscription)
  const event = stripeEvent("checkout.session.completed", session, { id: "evt_checkout_once" })

  const first = await fixture.handler(signedRequest(fixture.signatureStripe, event))
  assert.equal(first.status, 200)
  assert.equal((await first.json()).applied, true)
  assert.equal(fixture.writer.mutations[0].subject, accountSubject)
  assert.equal(fixture.writer.mutations[0].billingEmail, accountEmail)
  assert.equal(fixture.writer.mutations[0].plan, "starter")
  assert.equal(fixture.writer.mutations[0].subscriptionStatus, "trialing")
  assert.equal(fixture.writer.resetCount, 1)

  const replay = await fixture.handler(signedRequest(fixture.signatureStripe, event))
  const replayBody = await replay.json()
  assert.equal(replay.status, 200)
  assert.equal(replayBody.duplicate, true)
  assert.equal(fixture.writer.mutations.length, 1)
  assert.equal(fixture.writer.resetCount, 1)
})

test("checkout rejects mismatched or invalid stable customer subjects", async (context) => {
  await context.test("session subject mismatch", async () => {
    const gateway = new FakeGateway()
    const writer = new MemoryEntitlementWriter()
    const session = checkoutSession({ metadataSubject: secondarySubject })
    gateway.sessions.set(session.id, session)
    gateway.subscriptions.set("sub_primary", subscription())

    await assert.rejects(
      processStripeLifecycleEvent({
        event: stripeEvent("checkout.session.completed", session),
        gateway,
        writer,
        config: config(),
      }),
      (error: unknown) =>
        error instanceof Error && error.message === "Stripe customer subject sources do not match",
    )
    assert.equal(writer.mutations.length, 0)
  })

  await context.test("invalid subscription subject", async () => {
    const gateway = new FakeGateway()
    const writer = new MemoryEntitlementWriter()
    const session = checkoutSession()
    gateway.sessions.set(session.id, session)
    gateway.subscriptions.set("sub_primary", subscription({ subject: accountEmail }))

    await assert.rejects(
      processStripeLifecycleEvent({
        event: stripeEvent("checkout.session.completed", session),
        gateway,
        writer,
        config: config(),
      }),
      (error: unknown) => error instanceof Error && error.message === "Stripe customer subject is invalid",
    )
    assert.equal(writer.mutations.length, 0)
  })
})

test("billing email sources must agree independently of the stable subject", async () => {
  const gateway = new FakeGateway()
  const writer = new MemoryEntitlementWriter()
  const session = checkoutSession()
  gateway.sessions.set(session.id, session)
  gateway.subscriptions.set("sub_primary", subscription({ email: "different@example.com" }))

  await assert.rejects(
    processStripeLifecycleEvent({
      event: stripeEvent("checkout.session.completed", session),
      gateway,
      writer,
      config: config(),
    }),
    (error: unknown) =>
      error instanceof Error && error.message === "Subscription identity sources do not match",
  )
  assert.equal(writer.mutations.length, 0)
})

test("entitlement lifecycle state is isolated across stable customer subjects", async () => {
  const gateway = new FakeGateway()
  const writer = new MemoryEntitlementWriter()
  const primary = subscription({ id: "sub_primary_subject", subject: accountSubject, created: 100 })
  const secondary = subscription({
    id: "sub_secondary_subject",
    subject: secondarySubject,
    created: 110,
  })
  gateway.subscriptions.set(primary.id, primary)
  gateway.subscriptions.set(secondary.id, secondary)

  await processStripeLifecycleEvent({
    event: stripeEvent("customer.subscription.created", primary, {
      id: "evt_primary_subject",
      created: 200,
    }),
    gateway,
    writer,
    config: config(),
  })
  await processStripeLifecycleEvent({
    event: stripeEvent("customer.subscription.created", secondary, {
      id: "evt_secondary_subject",
      created: 210,
    }),
    gateway,
    writer,
    config: config(),
  })
  await processStripeLifecycleEvent({
    event: stripeEvent(
      "customer.subscription.deleted",
      subscription({
        id: primary.id,
        subject: accountSubject,
        status: "canceled",
        created: 100,
      }),
      { id: "evt_primary_canceled", created: 220 },
    ),
    gateway,
    writer,
    config: config(),
  })

  assert.equal(writer.states.size, 2)
  assert.equal(writer.states.get(accountSubject)?.subscriptionStatus, "canceled")
  assert.equal(writer.states.get(secondarySubject)?.subscriptionStatus, "trialing")
  assert.equal(writer.states.get(secondarySubject)?.stripeSubscriptionId, secondary.id)
})

test("cancellation uses immutable subscription ownership after price, metadata, and email drift", async () => {
  const gateway = new FakeGateway()
  const writer = new MemoryEntitlementWriter()
  const active = subscription({ id: "sub_drift_safe", status: "active" })
  gateway.subscriptions.set(active.id, active)

  await processStripeLifecycleEvent({
    event: stripeEvent("customer.subscription.created", active, {
      id: "evt_drift_owner_recorded",
      created: 200,
    }),
    gateway,
    writer,
    config: config(),
  })

  const canceledWithDrift = {
    ...subscription({
      id: active.id,
      status: "canceled",
      priceId: "price_retired_from_allowlist",
      email: "changed@example.com",
    }),
    metadata: {},
    customer: {
      id: "cus_changed",
      object: "customer",
      email: "changed@example.com",
    },
  } as unknown as Stripe.Subscription
  const result = await processStripeLifecycleEvent({
    event: stripeEvent("customer.subscription.deleted", canceledWithDrift, {
      id: "evt_drift_canceled",
      created: 300,
    }),
    gateway,
    writer,
    config: config(),
  })

  assert.equal(result.applied, true)
  assert.equal(writer.subscriptionOwners.get(active.id), accountSubject)
  assert.equal(writer.states.get(accountSubject)?.subscriptionStatus, "canceled")
  assert.equal(writer.states.get(accountSubject)?.stripeLastEventId, "evt_drift_canceled")
})

test("past-due revocation uses immutable ownership after subscription field drift", async () => {
  const gateway = new FakeGateway()
  const writer = new MemoryEntitlementWriter()
  const active = subscription({ id: "sub_past_due_drift", status: "active" })
  gateway.subscriptions.set(active.id, active)
  await processStripeLifecycleEvent({
    event: stripeEvent("customer.subscription.created", active, {
      id: "evt_past_due_owner_recorded",
      created: 200,
    }),
    gateway,
    writer,
    config: config(),
  })

  const pastDueWithDrift = {
    ...subscription({
      id: active.id,
      status: "past_due",
      priceId: "price_retired_from_allowlist",
      email: "changed@example.com",
    }),
    metadata: {},
    customer: {
      id: "cus_changed",
      object: "customer",
      email: "changed@example.com",
    },
  } as unknown as Stripe.Subscription
  gateway.subscriptions.set(active.id, pastDueWithDrift)

  const result = await processStripeLifecycleEvent({
    event: stripeEvent("customer.subscription.updated", pastDueWithDrift, {
      id: "evt_past_due_drift",
      created: 300,
    }),
    gateway,
    writer,
    config: config(),
  })

  assert.equal(result.applied, true)
  assert.equal(writer.states.get(accountSubject)?.subscriptionStatus, "past_due")
  assert.equal(writer.states.get(accountSubject)?.stripeLastEventId, "evt_past_due_drift")
})

test("subscription ownership mapping is immutable across customer subjects", async () => {
  const gateway = new FakeGateway()
  const writer = new MemoryEntitlementWriter()
  const primary = subscription({ id: "sub_immutable_owner", subject: accountSubject, status: "active" })
  gateway.subscriptions.set(primary.id, primary)
  await processStripeLifecycleEvent({
    event: stripeEvent("customer.subscription.created", primary, {
      id: "evt_immutable_primary",
      created: 200,
    }),
    gateway,
    writer,
    config: config(),
  })

  const conflicting = subscription({
    id: primary.id,
    subject: secondarySubject,
    status: "active",
    created: 300,
  })
  gateway.subscriptions.set(conflicting.id, conflicting)

  await assert.rejects(
    processStripeLifecycleEvent({
      event: stripeEvent("customer.subscription.updated", conflicting, {
        id: "evt_immutable_conflict",
        created: 310,
      }),
      gateway,
      writer,
      config: config(),
    }),
    (error: unknown) =>
      error instanceof StripeFulfillmentError &&
      error.code === "STRIPE_SUBSCRIPTION_OWNER_CONFLICT",
  )
  assert.equal(writer.subscriptionOwners.get(primary.id), accountSubject)
  assert.equal(writer.states.has(secondarySubject), false)
})

test("completion-marker failure retries safely without another credit reset", async () => {
  const fixture = webhookFixture()
  const session = checkoutSession()
  const activeSubscription = subscription({ status: "active" })
  fixture.gateway.sessions.set(session.id, session)
  fixture.gateway.subscriptions.set(activeSubscription.id, activeSubscription)
  fixture.claims.failCompleteOnce = true
  const event = stripeEvent("checkout.session.completed", session, {
    id: "evt_completion_retry",
  })

  const failed = await fixture.handler(signedRequest(fixture.signatureStripe, event))
  assert.equal(failed.status, 500)
  assert.equal(fixture.claims.states.has(event.id), false)
  assert.equal(fixture.writer.resetCount, 1)

  const retried = await fixture.handler(signedRequest(fixture.signatureStripe, event))
  const body = await retried.json()
  assert.equal(retried.status, 200)
  assert.equal(body.applied, false)
  assert.equal(body.reason, "IDEMPOTENT")
  assert.equal(fixture.writer.resetCount, 1)
  assert.equal(fixture.claims.states.get(event.id), "done")
})

test("checkout, subscription creation, and paid invoice reset credits once per billing cycle", async () => {
  const gateway = new FakeGateway()
  const writer = new MemoryEntitlementWriter()
  const session = checkoutSession()
  const activeSubscription = subscription({ status: "active", periodStart: 500 })
  gateway.sessions.set(session.id, session)
  gateway.subscriptions.set(activeSubscription.id, activeSubscription)

  await processStripeLifecycleEvent({
    event: stripeEvent("checkout.session.completed", session, { id: "evt_checkout", created: 510 }),
    gateway,
    writer,
    config: config(),
  })
  await processStripeLifecycleEvent({
    event: stripeEvent("customer.subscription.created", activeSubscription, {
      id: "evt_created",
      created: 520,
    }),
    gateway,
    writer,
    config: config(),
  })
  await processStripeLifecycleEvent({
    event: stripeEvent("invoice.payment_succeeded", invoice(), {
      id: "evt_invoice",
      created: 530,
    }),
    gateway,
    writer,
    config: config(),
  })

  assert.equal(writer.resetCount, 1)
  assert.equal(
    writer.states.get(accountSubject)?.planCredits,
    monthlyCreditsForPlan("starter"),
  )
  assert.equal(writer.states.get(accountSubject)?.stripeCreditCycle, "sub_primary:500")
})

test("unapproved or non-recurring prices fail closed without mutation", async () => {
  const gateway = new FakeGateway()
  const writer = new MemoryEntitlementWriter()
  const session = checkoutSession()
  const unapproved = subscription({ priceId: "price_not_approved" })
  gateway.sessions.set(session.id, session)
  gateway.subscriptions.set(unapproved.id, unapproved)

  await assert.rejects(
    processStripeLifecycleEvent({
      event: stripeEvent("checkout.session.completed", session),
      gateway,
      writer,
      config: config(),
    }),
    (error: unknown) =>
      error instanceof Error && error.message === "Subscription price is not an approved recurring plan",
  )
  assert.equal(writer.mutations.length, 0)

  const nonRecurring = subscription({ priceId: approvedPrice, recurring: false })
  gateway.subscriptions.set(nonRecurring.id, nonRecurring)
  await assert.rejects(
    processStripeLifecycleEvent({
      event: stripeEvent("checkout.session.completed", session, {
        id: "evt_non_recurring",
      }),
      gateway,
      writer,
      config: config(),
    }),
    (error: unknown) =>
      error instanceof Error && error.message === "Subscription price is not an approved recurring plan",
  )
  assert.equal(writer.mutations.length, 0)
})

test("subscription checkout must be complete and settled before fulfillment", async () => {
  const gateway = new FakeGateway()
  const writer = new MemoryEntitlementWriter()
  const incomplete = checkoutSession({ status: "open", paymentStatus: "unpaid" })
  gateway.sessions.set(incomplete.id, incomplete)
  gateway.subscriptions.set("sub_primary", subscription())

  await assert.rejects(
    processStripeLifecycleEvent({
      event: stripeEvent("checkout.session.completed", incomplete),
      gateway,
      writer,
      config: config(),
    }),
    (error: unknown) => error instanceof Error && error.message === "Checkout Session is not complete",
  )
  assert.equal(writer.mutations.length, 0)

  const unpaid = checkoutSession({ status: "complete", paymentStatus: "unpaid" })
  gateway.sessions.set(unpaid.id, unpaid)
  await assert.rejects(
    processStripeLifecycleEvent({
      event: stripeEvent("checkout.session.completed", unpaid, { id: "evt_unpaid" }),
      gateway,
      writer,
      config: config(),
    }),
    (error: unknown) =>
      error instanceof Error && error.message === "Checkout Session payment state is not settled",
  )
  assert.equal(writer.mutations.length, 0)
})

test("test-mode staging rejects live events and objects", async () => {
  const fixture = webhookFixture()
  const liveSession = checkoutSession({ mode: "payment", livemode: true })
  const event = stripeEvent("checkout.session.completed", liveSession, {
    id: "evt_live_rejected",
    livemode: true,
  })
  const response = await fixture.handler(signedRequest(fixture.signatureStripe, event))
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.equal(body.code, "STRIPE_EVENT_MODE_REJECTED")
  assert.equal(fixture.writer.mutations.length, 0)
  assert.equal(fixture.claims.states.has(event.id), false)
})

test("cancellation is terminal for the same subscription and old subscriptions cannot affect a replacement", async () => {
  const gateway = new FakeGateway()
  const writer = new MemoryEntitlementWriter()
  const primaryActive = subscription({ id: "sub_a", status: "active", created: 100 })
  gateway.subscriptions.set(primaryActive.id, primaryActive)

  await processStripeLifecycleEvent({
    event: stripeEvent("customer.subscription.created", primaryActive, {
      id: "evt_a_active",
      created: 200,
    }),
    gateway,
    writer,
    config: config(),
  })

  const primaryCanceled = subscription({ id: "sub_a", status: "canceled", created: 100 })
  await processStripeLifecycleEvent({
    event: stripeEvent("customer.subscription.deleted", primaryCanceled, {
      id: "evt_a_canceled",
      created: 300,
    }),
    gateway,
    writer,
    config: config(),
  })
  assert.equal(writer.states.get(accountSubject)?.subscriptionStatus, "canceled")

  gateway.subscriptions.set(primaryActive.id, primaryActive)
  const staleResult = await processStripeLifecycleEvent({
    event: stripeEvent("customer.subscription.updated", primaryActive, {
      id: "evt_a_stale_active",
      created: 250,
    }),
    gateway,
    writer,
    config: config(),
  })
  assert.equal(staleResult.applied, false)
  assert.equal(writer.states.get(accountSubject)?.subscriptionStatus, "canceled")

  const replacement = subscription({
    id: "sub_b",
    status: "active",
    created: 400,
    periodStart: 400,
  })
  gateway.subscriptions.set(replacement.id, replacement)
  await processStripeLifecycleEvent({
    event: stripeEvent("customer.subscription.created", replacement, {
      id: "evt_b_active",
      created: 410,
    }),
    gateway,
    writer,
    config: config(),
  })
  assert.equal(writer.states.get(accountSubject)?.stripeSubscriptionId, "sub_b")
  assert.equal(writer.states.get(accountSubject)?.subscriptionStatus, "active")

  const oldPastDue = subscription({ id: "sub_a", status: "past_due", created: 100 })
  gateway.subscriptions.set(oldPastDue.id, oldPastDue)
  const unrelated = await processStripeLifecycleEvent({
    event: stripeEvent(
      "invoice.payment_failed",
      invoice({ subscriptionId: "sub_a", paid: false, status: "open" }),
      { id: "evt_old_failed", created: 500 },
    ),
    gateway,
    writer,
    config: config(),
  })
  assert.equal(unrelated.applied, false)
  assert.equal(writer.states.get(accountSubject)?.stripeSubscriptionId, "sub_b")
  assert.equal(writer.states.get(accountSubject)?.subscriptionStatus, "active")
})

test("failed payment removes access while a recovered current subscription is not downgraded", async () => {
  const gateway = new FakeGateway()
  const writer = new MemoryEntitlementWriter()
  const active = subscription({ status: "active" })
  gateway.subscriptions.set(active.id, active)
  await processStripeLifecycleEvent({
    event: stripeEvent("customer.subscription.created", active, {
      id: "evt_active",
      created: 200,
    }),
    gateway,
    writer,
    config: config(),
  })

  const recoveredFailure = await processStripeLifecycleEvent({
    event: stripeEvent(
      "invoice.payment_failed",
      invoice({ paid: false, status: "open" }),
      { id: "evt_failure_recovered", created: 210 },
    ),
    gateway,
    writer,
    config: config(),
  })
  assert.equal(recoveredFailure.reason, "RECOVERED_SUBSCRIPTION_IGNORED")
  assert.equal(writer.states.get(accountSubject)?.subscriptionStatus, "active")

  const pastDue = subscription({ status: "past_due" })
  gateway.subscriptions.set(pastDue.id, pastDue)
  await processStripeLifecycleEvent({
    event: stripeEvent(
      "invoice.payment_failed",
      invoice({ paid: false, status: "open" }),
      { id: "evt_failure_current", created: 220 },
    ),
    gateway,
    writer,
    config: config(),
  })
  assert.equal(writer.states.get(accountSubject)?.subscriptionStatus, "past_due")
  assert.equal(
    ["active", "trialing"].includes(writer.states.get(accountSubject)?.subscriptionStatus ?? ""),
    false,
  )
})

test("stale payment failure cannot revoke newer access while cancellation remains terminal", async () => {
  const gateway = new FakeGateway()
  const writer = new MemoryEntitlementWriter()
  const active = subscription({ id: "sub_ordered", status: "active", created: 100 })
  gateway.subscriptions.set(active.id, active)

  await processStripeLifecycleEvent({
    event: stripeEvent("customer.subscription.created", active, {
      id: "evt_newer_active",
      created: 300,
    }),
    gateway,
    writer,
    config: config(),
  })

  const pastDue = subscription({ id: active.id, status: "past_due", created: 100 })
  gateway.subscriptions.set(pastDue.id, pastDue)
  const staleFailure = await processStripeLifecycleEvent({
    event: stripeEvent(
      "invoice.payment_failed",
      invoice({ subscriptionId: active.id, paid: false, status: "open" }),
      { id: "evt_older_payment_failed", created: 200 },
    ),
    gateway,
    writer,
    config: config(),
  })

  assert.equal(staleFailure.applied, false)
  assert.equal(staleFailure.reason, "STALE_EVENT")
  assert.equal(writer.states.get(accountSubject)?.subscriptionStatus, "active")
  assert.equal(writer.states.get(accountSubject)?.stripeLastEventId, "evt_newer_active")
  assert.equal(writer.states.get(accountSubject)?.stripeLastEventCreated, 300)

  const canceled = subscription({ id: active.id, status: "canceled", created: 100 })
  const staleCancellation = await processStripeLifecycleEvent({
    event: stripeEvent("customer.subscription.deleted", canceled, {
      id: "evt_older_terminal_cancellation",
      created: 150,
    }),
    gateway,
    writer,
    config: config(),
  })

  assert.equal(staleCancellation.applied, true)
  assert.equal(staleCancellation.reason, "APPLIED")
  assert.equal(writer.states.get(accountSubject)?.subscriptionStatus, "canceled")
  assert.equal(writer.states.get(accountSubject)?.stripeLastEventCreated, 300)

  gateway.subscriptions.set(active.id, active)
  const attemptedReactivation = await processStripeLifecycleEvent({
    event: stripeEvent("customer.subscription.updated", active, {
      id: "evt_later_reactivation",
      created: 400,
    }),
    gateway,
    writer,
    config: config(),
  })

  assert.equal(attemptedReactivation.applied, false)
  assert.equal(attemptedReactivation.reason, "TERMINAL_SUBSCRIPTION")
  assert.equal(writer.states.get(accountSubject)?.subscriptionStatus, "canceled")
})
