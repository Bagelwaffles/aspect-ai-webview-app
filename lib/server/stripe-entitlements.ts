import type Stripe from "stripe"
import type { Redis } from "@upstash/redis"
import { NextRequest, NextResponse } from "next/server"

import { isStableCustomerSubject } from "../auth"
import type { PlanSlug, StripeEventClaim, SubscriptionStatus } from "./entitlements"

export type StripeWebhookMode = "test" | "live"

export type StripeEntitlementConfig = {
  expectedLivemode: boolean
  priceToPlan: ReadonlyMap<string, PlanSlug>
}

export type StripeEntitlementMutation = {
  subject: string
  billingEmail: string
  plan: PlanSlug
  subscriptionStatus: SubscriptionStatus
  stripeCustomerId: string
  stripeSubscriptionId: string
  stripePriceId: string
  stripeEventId: string
  stripeEventCreated: number
  stripeSubscriptionCreated: number
  billingCycleKey: string
  resetPlanCredits: boolean
}

export type StripeEntitlementApplyResult = {
  applied: boolean
  idempotent: boolean
  creditsReset: boolean
  reason: "APPLIED" | "IDEMPOTENT" | "STALE_EVENT" | "UNRELATED_SUBSCRIPTION" | "TERMINAL_SUBSCRIPTION"
}

export interface StripeEntitlementWriter {
  apply(input: StripeEntitlementMutation): Promise<StripeEntitlementApplyResult>
}

export interface StripeReadGateway {
  retrieveCheckoutSession(id: string): Promise<Stripe.Checkout.Session>
  retrieveSubscription(id: string): Promise<Stripe.Subscription>
  retrieveCustomer(id: string): Promise<Stripe.Customer | Stripe.DeletedCustomer>
}

export type StripeEventProcessingResult = {
  processed: boolean
  applied: boolean
  creditsReset: boolean
  reason: string
}

export type StoredStripeEntitlementState = {
  subject: string
  billingEmail: string
  plan: PlanSlug
  subscriptionStatus: SubscriptionStatus
  stripeCustomerId: string
  stripeSubscriptionId: string
  stripePriceId: string
  stripeLastEventId: string
  stripeLastEventCreated: number
  stripeSubscriptionCreated: number
  stripeCreditCycle: string
  planCredits: number
}

export type StripeTransitionDecision = StripeEntitlementApplyResult & {
  next: StoredStripeEntitlementState
}

export type StripeFulfillmentErrorCode =
  | "STRIPE_FULFILLMENT_CONFIGURATION_INVALID"
  | "STRIPE_EVENT_MODE_REJECTED"
  | "STRIPE_OBJECT_MODE_MISMATCH"
  | "STRIPE_CHECKOUT_NOT_COMPLETE"
  | "STRIPE_CHECKOUT_PAYMENT_NOT_SETTLED"
  | "STRIPE_CHECKOUT_SUBSCRIPTION_MISSING"
  | "STRIPE_SUBSCRIPTION_SUBJECT_MISSING"
  | "STRIPE_SUBSCRIPTION_SUBJECT_INVALID"
  | "STRIPE_SUBSCRIPTION_SUBJECT_MISMATCH"
  | "STRIPE_SUBSCRIPTION_PRICE_INVALID"
  | "STRIPE_SUBSCRIPTION_EMAIL_MISSING"
  | "STRIPE_SUBSCRIPTION_EMAIL_INVALID"
  | "STRIPE_SUBSCRIPTION_EMAIL_MISMATCH"
  | "STRIPE_INVOICE_STATE_INVALID"

export class StripeFulfillmentError extends Error {
  readonly code: StripeFulfillmentErrorCode
  readonly httpStatus: 400 | 500 | 503

  constructor(code: StripeFulfillmentErrorCode, message: string, httpStatus: 400 | 500 | 503 = 500) {
    super(message)
    this.name = "StripeFulfillmentError"
    this.code = code
    this.httpStatus = httpStatus
  }
}

const PRICE_ENV: Record<PlanSlug, string> = {
  starter: "AMS_STRIPE_STARTER_PRICE_ID",
  growth: "AMS_STRIPE_GROWTH_PRICE_ID",
  pro: "AMS_STRIPE_PRO_PRICE_ID",
}

const APPLY_STRIPE_ENTITLEMENT_SCRIPT = `
  local currentSubscriptionId = redis.call('HGET', KEYS[1], 'stripeSubscriptionId') or ''
  local currentSubscriptionCreated = tonumber(redis.call('HGET', KEYS[1], 'stripeSubscriptionCreated') or '-1')
  local currentEventCreated = tonumber(redis.call('HGET', KEYS[1], 'stripeLastEventCreated') or '-1')
  local currentEventId = redis.call('HGET', KEYS[1], 'stripeLastEventId') or ''
  local currentStatus = redis.call('HGET', KEYS[1], 'subscriptionStatus') or 'inactive'
  local currentCycle = redis.call('HGET', KEYS[1], 'stripeCreditCycle') or ''

  local newStatus = ARGV[4]
  local newSubscriptionId = ARGV[6]
  local newEventId = ARGV[8]
  local newEventCreated = tonumber(ARGV[9])
  local newSubscriptionCreated = tonumber(ARGV[10])
  local newCycle = ARGV[11]
  local shouldReset = ARGV[12] == '1'
  local hasAccess = newStatus == 'active' or newStatus == 'trialing'

  if currentEventId == newEventId then
    return {'ignored', 'IDEMPOTENT', '0'}
  end

  if currentSubscriptionId ~= '' and currentSubscriptionId ~= newSubscriptionId then
    if not hasAccess or newSubscriptionCreated <= currentSubscriptionCreated then
      return {'ignored', 'UNRELATED_SUBSCRIPTION', '0'}
    end
  elseif currentSubscriptionId == newSubscriptionId and currentSubscriptionId ~= '' then
    if currentStatus == 'canceled' and hasAccess then
      return {'ignored', 'TERMINAL_SUBSCRIPTION', '0'}
    end
    if newEventCreated < currentEventCreated then
      return {'ignored', 'STALE_EVENT', '0'}
    end
    if newEventCreated == currentEventCreated then
      local ranks = {active = 2, trialing = 2, inactive = 3, past_due = 3, canceled = 4}
      if (ranks[newStatus] or 0) < (ranks[currentStatus] or 0) then
        return {'ignored', 'STALE_EVENT', '0'}
      end
    end
  elseif currentSubscriptionId == '' and not hasAccess then
    return {'ignored', 'UNRELATED_SUBSCRIPTION', '0'}
  end

  redis.call(
    'HSET', KEYS[1],
    'subject', ARGV[1],
    'billingEmail', ARGV[2],
    'plan', ARGV[3],
    'subscriptionStatus', newStatus,
    'stripeCustomerId', ARGV[5],
    'stripeSubscriptionId', newSubscriptionId,
    'stripePriceId', ARGV[7],
    'stripeLastEventId', newEventId,
    'stripeLastEventCreated', ARGV[9],
    'stripeSubscriptionCreated', ARGV[10],
    'updatedAt', ARGV[14]
  )

  local creditsReset = '0'
  if hasAccess and shouldReset and newCycle ~= '' and newCycle ~= currentCycle then
    redis.call('SET', KEYS[2], ARGV[13])
    redis.call('HSET', KEYS[1], 'stripeCreditCycle', newCycle)
    creditsReset = '1'
  end

  return {'applied', 'APPLIED', creditsReset}
`

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null
  const email = value.trim().toLowerCase()
  return email.includes("@") ? email : null
}

function customerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer): string {
  return typeof customer === "string" ? customer : customer.id
}

function hasSubscriptionAccess(status: SubscriptionStatus): boolean {
  return status === "active" || status === "trialing"
}

function statusRank(status: SubscriptionStatus): number {
  if (status === "canceled") return 4
  if (status === "past_due" || status === "inactive") return 3
  return 2
}

function monthlyCredits(plan: PlanSlug): number {
  if (plan === "starter") return 2000
  if (plan === "growth") return 8000
  return 20000
}

export function stripeWebhookModeFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): StripeWebhookMode {
  const mode = (env.AMS_STRIPE_WEBHOOK_MODE ?? "test").trim().toLowerCase()
  if (mode !== "test" && mode !== "live") {
    throw new StripeFulfillmentError(
      "STRIPE_FULFILLMENT_CONFIGURATION_INVALID",
      "Stripe webhook mode must be test or live",
      503,
    )
  }
  return mode
}

export function assertStripeSecretKeyMatchesMode(
  secretKey: string,
  env: NodeJS.ProcessEnv = process.env,
): StripeWebhookMode {
  const mode = stripeWebhookModeFromEnv(env)
  const expectedPrefix = mode === "live" ? "sk_live_" : "sk_test_"
  if (!secretKey.trim().startsWith(expectedPrefix)) {
    throw new StripeFulfillmentError(
      "STRIPE_FULFILLMENT_CONFIGURATION_INVALID",
      "Stripe secret key does not match the configured billing mode",
      503,
    )
  }
  return mode
}

export function resolvePublicAppUrl(input: {
  env?: NodeJS.ProcessEnv
  requestOrigin?: string
}): string {
  const env = input.env ?? process.env
  const production = env.NODE_ENV === "production"
  const configured = env.PUBLIC_APP_URL?.trim()
  const candidate = configured || (!production ? input.requestOrigin?.trim() : undefined)
  if (!candidate) throw new Error("PUBLIC_APP_URL_REQUIRED")

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new Error("PUBLIC_APP_URL_INVALID")
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    (production && url.protocol !== "https:") ||
    (production &&
      ["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"].includes(
        url.hostname,
      )) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error("PUBLIC_APP_URL_INVALID")
  }

  return url.origin
}

export function stripeEntitlementConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): StripeEntitlementConfig {
  const mode = stripeWebhookModeFromEnv(env)

  const priceToPlan = new Map<string, PlanSlug>()
  for (const plan of Object.keys(PRICE_ENV) as PlanSlug[]) {
    const priceId = env[PRICE_ENV[plan]]?.trim()
    if (!priceId) continue
    if (priceToPlan.has(priceId)) {
      throw new StripeFulfillmentError(
        "STRIPE_FULFILLMENT_CONFIGURATION_INVALID",
        "Stripe price IDs must map to exactly one plan",
        503,
      )
    }
    priceToPlan.set(priceId, plan)
  }

  if (priceToPlan.size === 0) {
    throw new StripeFulfillmentError(
      "STRIPE_FULFILLMENT_CONFIGURATION_INVALID",
      "At least one approved recurring Stripe price is required",
      503,
    )
  }

  return { expectedLivemode: mode === "live", priceToPlan }
}

export function statusFromStripe(status: Stripe.Subscription.Status): SubscriptionStatus {
  if (status === "active") return "active"
  if (status === "trialing") return "trialing"
  if (status === "past_due" || status === "unpaid" || status === "incomplete") return "past_due"
  if (status === "canceled" || status === "incomplete_expired") return "canceled"
  return "inactive"
}

export function decideStripeEntitlementTransition(
  current: StoredStripeEntitlementState | null,
  mutation: StripeEntitlementMutation,
): StripeTransitionDecision {
  const nextBase: StoredStripeEntitlementState = {
    subject: mutation.subject,
    billingEmail: mutation.billingEmail,
    plan: mutation.plan,
    subscriptionStatus: mutation.subscriptionStatus,
    stripeCustomerId: mutation.stripeCustomerId,
    stripeSubscriptionId: mutation.stripeSubscriptionId,
    stripePriceId: mutation.stripePriceId,
    stripeLastEventId: mutation.stripeEventId,
    stripeLastEventCreated: mutation.stripeEventCreated,
    stripeSubscriptionCreated: mutation.stripeSubscriptionCreated,
    stripeCreditCycle: current?.stripeCreditCycle ?? "",
    planCredits: current?.planCredits ?? 0,
  }

  const ignored = (
    reason: Exclude<StripeEntitlementApplyResult["reason"], "APPLIED">,
  ): StripeTransitionDecision => ({
    applied: false,
    idempotent: reason === "IDEMPOTENT",
    creditsReset: false,
    reason,
    next: current ?? nextBase,
  })

  if (current?.stripeLastEventId === mutation.stripeEventId) return ignored("IDEMPOTENT")
  if (current && current.subject !== mutation.subject) return ignored("UNRELATED_SUBSCRIPTION")

  const newHasAccess = hasSubscriptionAccess(mutation.subscriptionStatus)
  if (current && current.stripeSubscriptionId !== mutation.stripeSubscriptionId) {
    if (!newHasAccess || mutation.stripeSubscriptionCreated <= current.stripeSubscriptionCreated) {
      return ignored("UNRELATED_SUBSCRIPTION")
    }
  } else if (current) {
    if (current.subscriptionStatus === "canceled" && newHasAccess) {
      return ignored("TERMINAL_SUBSCRIPTION")
    }
    if (mutation.stripeEventCreated < current.stripeLastEventCreated) {
      return ignored("STALE_EVENT")
    }
    if (
      mutation.stripeEventCreated === current.stripeLastEventCreated &&
      statusRank(mutation.subscriptionStatus) < statusRank(current.subscriptionStatus)
    ) {
      return ignored("STALE_EVENT")
    }
  } else if (!newHasAccess) {
    return ignored("UNRELATED_SUBSCRIPTION")
  }

  const creditsReset =
    newHasAccess &&
    mutation.resetPlanCredits &&
    Boolean(mutation.billingCycleKey) &&
    mutation.billingCycleKey !== current?.stripeCreditCycle

  return {
    applied: true,
    idempotent: false,
    creditsReset,
    reason: "APPLIED",
    next: {
      ...nextBase,
      stripeCreditCycle: creditsReset
        ? mutation.billingCycleKey
        : current?.stripeCreditCycle ?? "",
      planCredits: creditsReset ? monthlyCredits(mutation.plan) : current?.planCredits ?? 0,
    },
  }
}

export class UpstashStripeEntitlementWriter implements StripeEntitlementWriter {
  constructor(private readonly redis: Pick<Redis, "eval">) {}

  async apply(input: StripeEntitlementMutation): Promise<StripeEntitlementApplyResult> {
    const subject = input.subject.trim()
    if (!isStableCustomerSubject(subject)) {
      throw new StripeFulfillmentError(
        "STRIPE_SUBSCRIPTION_SUBJECT_INVALID",
        "A stable customer subject is required",
      )
    }
    const billingEmail = normalizeEmail(input.billingEmail)
    if (!billingEmail) {
      throw new StripeFulfillmentError(
        "STRIPE_SUBSCRIPTION_EMAIL_MISSING",
        "A valid subscription email is required",
      )
    }

    const profileKey = `ams:entitlements:profile:${subject}`
    const planCreditsKey = `ams:credits:plan:${subject}`
    const raw = await this.redis.eval(
      APPLY_STRIPE_ENTITLEMENT_SCRIPT,
      [profileKey, planCreditsKey],
      [
        subject,
        billingEmail,
        input.plan,
        input.subscriptionStatus,
        input.stripeCustomerId,
        input.stripeSubscriptionId,
        input.stripePriceId,
        input.stripeEventId,
        input.stripeEventCreated,
        input.stripeSubscriptionCreated,
        input.billingCycleKey,
        input.resetPlanCredits ? "1" : "0",
        monthlyCredits(input.plan),
        new Date().toISOString(),
      ],
    )

    if (!Array.isArray(raw) || typeof raw[0] !== "string" || typeof raw[1] !== "string") {
      throw new Error("Invalid Stripe entitlement datastore response")
    }

    const reason = raw[1] as StripeEntitlementApplyResult["reason"]
    if (raw[0] === "ignored") {
      if (!["IDEMPOTENT", "STALE_EVENT", "UNRELATED_SUBSCRIPTION", "TERMINAL_SUBSCRIPTION"].includes(reason)) {
        throw new Error("Invalid Stripe entitlement ignore result")
      }
      return {
        applied: false,
        idempotent: reason === "IDEMPOTENT",
        creditsReset: false,
        reason,
      }
    }

    if (raw[0] !== "applied" || reason !== "APPLIED") {
      throw new Error("Invalid Stripe entitlement apply result")
    }
    return {
      applied: true,
      idempotent: false,
      creditsReset: raw[2] === "1",
      reason: "APPLIED",
    }
  }
}

export function createStripeReadGateway(stripe: Stripe): StripeReadGateway {
  return {
    retrieveCheckoutSession: (id) =>
      stripe.checkout.sessions.retrieve(id, {
        expand: ["subscription", "line_items.data.price"],
      }),
    retrieveSubscription: (id) =>
      stripe.subscriptions.retrieve(id, { expand: ["items.data.price"] }),
    retrieveCustomer: (id) => stripe.customers.retrieve(id),
  }
}

function ensureLivemode(actual: boolean, config: StripeEntitlementConfig) {
  if (actual !== config.expectedLivemode) {
    throw new StripeFulfillmentError(
      "STRIPE_EVENT_MODE_REJECTED",
      "Stripe event mode does not match the configured webhook mode",
      400,
    )
  }
}

function planFromSubscription(
  subscription: Stripe.Subscription,
  config: StripeEntitlementConfig,
): { plan: PlanSlug; priceId: string } {
  const items = subscription.items?.data ?? []
  if (items.length !== 1) {
    throw new StripeFulfillmentError(
      "STRIPE_SUBSCRIPTION_PRICE_INVALID",
      "Subscription must contain exactly one approved recurring price",
    )
  }

  const item = items[0]
  const price = item.price
  const plan = config.priceToPlan.get(price.id)
  if (!price.recurring || (item.quantity ?? 1) !== 1 || !plan) {
    throw new StripeFulfillmentError(
      "STRIPE_SUBSCRIPTION_PRICE_INVALID",
      "Subscription price is not an approved recurring plan",
    )
  }
  return { plan, priceId: price.id }
}

async function emailForCustomer(
  gateway: StripeReadGateway,
  customer: string | Stripe.Customer | Stripe.DeletedCustomer,
): Promise<unknown> {
  const record = typeof customer === "string" ? await gateway.retrieveCustomer(customer) : customer
  return "email" in record ? record.email : null
}

function isMissingIdentitySource(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && !value.trim())
}

function resolveSubscriptionSubject(
  subscription: Stripe.Subscription,
  extraCandidates: unknown[] = [],
  requireExtraCandidates = false,
): string {
  const subscriptionCandidate = subscription.metadata?.customerSubject
  if (isMissingIdentitySource(subscriptionCandidate)) {
    throw new StripeFulfillmentError(
      "STRIPE_SUBSCRIPTION_SUBJECT_MISSING",
      "Subscription customer subject is missing",
    )
  }
  if (requireExtraCandidates && extraCandidates.some(isMissingIdentitySource)) {
    throw new StripeFulfillmentError(
      "STRIPE_SUBSCRIPTION_SUBJECT_MISSING",
      "Checkout customer subject is missing",
    )
  }

  const available = [subscriptionCandidate, ...extraCandidates].filter(
    (value) => !isMissingIdentitySource(value),
  )
  const subjects: string[] = []
  for (const value of available) {
    if (typeof value !== "string" || !isStableCustomerSubject(value.trim())) {
      throw new StripeFulfillmentError(
        "STRIPE_SUBSCRIPTION_SUBJECT_INVALID",
        "Stripe customer subject is invalid",
      )
    }
    subjects.push(value.trim())
  }

  if (new Set(subjects).size !== 1) {
    throw new StripeFulfillmentError(
      "STRIPE_SUBSCRIPTION_SUBJECT_MISMATCH",
      "Stripe customer subject sources do not match",
    )
  }
  return subjects[0]
}

async function resolveSubscriptionEmail(
  gateway: StripeReadGateway,
  subscription: Stripe.Subscription,
  extraCandidates: unknown[] = [],
): Promise<string> {
  const rawCandidates = [
    subscription.metadata?.userEmail,
    await emailForCustomer(gateway, subscription.customer),
    ...extraCandidates,
  ].filter((value) => !isMissingIdentitySource(value))

  const candidates: string[] = []
  for (const value of rawCandidates) {
    const email = normalizeEmail(value)
    if (!email) {
      throw new StripeFulfillmentError(
        "STRIPE_SUBSCRIPTION_EMAIL_INVALID",
        "Subscription billing email is invalid",
      )
    }
    candidates.push(email)
  }

  const unique = new Set(candidates)
  if (unique.size === 0) {
    throw new StripeFulfillmentError(
      "STRIPE_SUBSCRIPTION_EMAIL_MISSING",
      "Subscription identity is missing",
    )
  }
  if (unique.size !== 1) {
    throw new StripeFulfillmentError(
      "STRIPE_SUBSCRIPTION_EMAIL_MISMATCH",
      "Subscription identity sources do not match",
    )
  }
  return candidates[0]
}

function subscriptionMutation(input: {
  event: Stripe.Event
  subscription: Stripe.Subscription
  subject: string
  billingEmail: string
  plan: PlanSlug
  priceId: string
  status?: SubscriptionStatus
  resetPlanCredits: boolean
}): StripeEntitlementMutation {
  const status = input.status ?? statusFromStripe(input.subscription.status)
  return {
    subject: input.subject,
    billingEmail: input.billingEmail,
    plan: input.plan,
    subscriptionStatus: status,
    stripeCustomerId: customerId(input.subscription.customer),
    stripeSubscriptionId: input.subscription.id,
    stripePriceId: input.priceId,
    stripeEventId: input.event.id,
    stripeEventCreated: input.event.created,
    stripeSubscriptionCreated: input.subscription.created,
    billingCycleKey: `${input.subscription.id}:${input.subscription.current_period_start}`,
    resetPlanCredits: input.resetPlanCredits,
  }
}

async function applySubscription(input: {
  event: Stripe.Event
  subscription: Stripe.Subscription
  gateway: StripeReadGateway
  writer: StripeEntitlementWriter
  config: StripeEntitlementConfig
  subjectCandidates?: unknown[]
  requireSubjectCandidates?: boolean
  emailCandidates?: unknown[]
  status?: SubscriptionStatus
  resetPlanCredits: boolean
}): Promise<StripeEventProcessingResult> {
  ensureLivemode(input.subscription.livemode, input.config)
  const { plan, priceId } = planFromSubscription(input.subscription, input.config)
  const subject = resolveSubscriptionSubject(
    input.subscription,
    input.subjectCandidates,
    input.requireSubjectCandidates,
  )
  const billingEmail = await resolveSubscriptionEmail(
    input.gateway,
    input.subscription,
    input.emailCandidates,
  )
  const result = await input.writer.apply(
    subscriptionMutation({
      event: input.event,
      subscription: input.subscription,
      subject,
      billingEmail,
      plan,
      priceId,
      status: input.status,
      resetPlanCredits: input.resetPlanCredits,
    }),
  )
  return {
    processed: true,
    applied: result.applied,
    creditsReset: result.creditsReset,
    reason: result.reason,
  }
}

async function retrieveCurrentSubscription(
  gateway: StripeReadGateway,
  subscription: string | Stripe.Subscription,
): Promise<Stripe.Subscription> {
  const id = typeof subscription === "string" ? subscription : subscription.id
  return gateway.retrieveSubscription(id)
}

export async function processStripeLifecycleEvent(input: {
  event: Stripe.Event
  gateway: StripeReadGateway
  writer: StripeEntitlementWriter
  config: StripeEntitlementConfig
}): Promise<StripeEventProcessingResult> {
  const { event, gateway, writer, config } = input
  ensureLivemode(event.livemode, config)

  switch (event.type) {
    case "checkout.session.completed": {
      const eventSession = event.data.object as Stripe.Checkout.Session
      ensureLivemode(eventSession.livemode, config)
      if (eventSession.mode !== "subscription") {
        return {
          processed: false,
          applied: false,
          creditsReset: false,
          reason: "NON_SUBSCRIPTION_CHECKOUT_IGNORED",
        }
      }

      const session = await gateway.retrieveCheckoutSession(eventSession.id)
      ensureLivemode(session.livemode, config)
      if (session.mode !== "subscription") {
        throw new StripeFulfillmentError(
          "STRIPE_OBJECT_MODE_MISMATCH",
          "Checkout Session mode changed during verification",
        )
      }
      if (session.status !== "complete") {
        throw new StripeFulfillmentError(
          "STRIPE_CHECKOUT_NOT_COMPLETE",
          "Checkout Session is not complete",
        )
      }
      if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
        throw new StripeFulfillmentError(
          "STRIPE_CHECKOUT_PAYMENT_NOT_SETTLED",
          "Checkout Session payment state is not settled",
        )
      }
      if (!session.subscription) {
        throw new StripeFulfillmentError(
          "STRIPE_CHECKOUT_SUBSCRIPTION_MISSING",
          "Checkout Session has no subscription",
        )
      }

      const subscription = await retrieveCurrentSubscription(gateway, session.subscription)
      return applySubscription({
        event,
        subscription,
        gateway,
        writer,
        config,
        subjectCandidates: [
          eventSession.metadata?.customerSubject,
          eventSession.client_reference_id,
          session.metadata?.customerSubject,
          session.client_reference_id,
        ],
        requireSubjectCandidates: true,
        emailCandidates: [
          eventSession.metadata?.userEmail,
          eventSession.customer_details?.email,
          eventSession.customer_email,
          session.metadata?.userEmail,
          session.customer_details?.email,
          session.customer_email,
        ],
        resetPlanCredits: true,
      })
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const eventSubscription = event.data.object as Stripe.Subscription
      ensureLivemode(eventSubscription.livemode, config)
      const subscription = await gateway.retrieveSubscription(eventSubscription.id)
      return applySubscription({
        event,
        subscription,
        gateway,
        writer,
        config,
        subjectCandidates: [eventSubscription.metadata?.customerSubject],
        requireSubjectCandidates: true,
        emailCandidates: [eventSubscription.metadata?.userEmail],
        resetPlanCredits: event.type === "customer.subscription.created",
      })
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription
      return applySubscription({
        event,
        subscription,
        gateway,
        writer,
        config,
        status: "canceled",
        resetPlanCredits: false,
      })
    }

    case "invoice.payment_succeeded":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice
      ensureLivemode(invoice.livemode, config)
      if (!invoice.subscription) {
        return {
          processed: false,
          applied: false,
          creditsReset: false,
          reason: "NON_SUBSCRIPTION_INVOICE_IGNORED",
        }
      }

      if (event.type === "invoice.payment_succeeded") {
        if (!invoice.paid || invoice.status !== "paid") {
          throw new StripeFulfillmentError(
            "STRIPE_INVOICE_STATE_INVALID",
            "Invoice success event is not paid",
          )
        }
      } else if (invoice.paid || invoice.status === "paid") {
        throw new StripeFulfillmentError(
          "STRIPE_INVOICE_STATE_INVALID",
          "Invoice failure event is already paid",
        )
      }

      const subscription = await retrieveCurrentSubscription(gateway, invoice.subscription)
      const currentStatus = statusFromStripe(subscription.status)
      if (
        event.type === "invoice.payment_failed" &&
        (currentStatus === "active" || currentStatus === "trialing")
      ) {
        return {
          processed: false,
          applied: false,
          creditsReset: false,
          reason: "RECOVERED_SUBSCRIPTION_IGNORED",
        }
      }

      const resetPlanCredits =
        event.type === "invoice.payment_succeeded" &&
        (invoice.billing_reason === "subscription_create" ||
          invoice.billing_reason === "subscription_cycle")

      return applySubscription({
        event,
        subscription,
        gateway,
        writer,
        config,
        emailCandidates: [invoice.customer_email],
        status: event.type === "invoice.payment_failed" ? currentStatus : undefined,
        resetPlanCredits,
      })
    }
  }

  return {
    processed: false,
    applied: false,
    creditsReset: false,
    reason: "UNHANDLED_EVENT_TYPE",
  }
}

const HANDLED_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
])

export type StripeWebhookRequestDependencies = {
  env: NodeJS.ProcessEnv
  isStoreConfigured: () => boolean
  createStripe: (secretKey: string) => Stripe
  claimEvent: (eventId: string) => Promise<StripeEventClaim>
  completeEvent: (eventId: string, token: string) => Promise<void>
  releaseEvent: (eventId: string, token: string) => Promise<void>
  processEvent: (
    stripe: Stripe,
    event: Stripe.Event,
    config: StripeEntitlementConfig,
  ) => Promise<StripeEventProcessingResult>
}

export function createStripeWebhookPostHandler(dependencies: StripeWebhookRequestDependencies) {
  return async function stripeWebhookPost(request: NextRequest) {
    const stripeSecretKey = dependencies.env.STRIPE_SECRET_KEY?.trim()
    const webhookSecret = dependencies.env.STRIPE_WEBHOOK_SECRET?.trim()

    if (!stripeSecretKey || !webhookSecret || !dependencies.isStoreConfigured()) {
      return NextResponse.json(
        { ok: false, error: "Webhook fulfillment is not configured" },
        { status: 503 },
      )
    }

    const signature = request.headers.get("stripe-signature")
    if (!signature) {
      return NextResponse.json({ ok: false, error: "Missing signature header" }, { status: 400 })
    }

    const stripe = dependencies.createStripe(stripeSecretKey)
    const body = await request.text()

    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 400 })
    }

    if (!HANDLED_EVENT_TYPES.has(event.type)) {
      return NextResponse.json({
        ok: true,
        received: true,
        processed: false,
        reason: "UNHANDLED_EVENT_TYPE",
      })
    }

    let config: StripeEntitlementConfig
    try {
      assertStripeSecretKeyMatchesMode(stripeSecretKey, dependencies.env)
      config = stripeEntitlementConfigFromEnv(dependencies.env)
    } catch {
      return NextResponse.json(
        { ok: false, error: "Webhook fulfillment is not configured" },
        { status: 503 },
      )
    }

    let claim: StripeEventClaim
    try {
      claim = await dependencies.claimEvent(event.id)
    } catch {
      console.error(`[Stripe] Event claim failed for ${event.type}`)
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
        { ok: false, received: true, error: "Webhook event is already processing", code: "EVENT_IN_PROGRESS" },
        { status: 503 },
      )
    }

    try {
      const result = await dependencies.processEvent(stripe, event, config)
      await dependencies.completeEvent(event.id, claim.token)
      console.info(`[Stripe] Processed ${event.type}`)
      return NextResponse.json({ ok: true, received: true, ...result })
    } catch (error) {
      try {
        await dependencies.releaseEvent(event.id, claim.token)
      } catch {
        console.error(`[Stripe] Event claim release failed for ${event.type}`)
      }

      const status = error instanceof StripeFulfillmentError ? error.httpStatus : 500
      const code = error instanceof StripeFulfillmentError ? error.code : "STRIPE_FULFILLMENT_FAILED"
      console.error(`[Stripe] Fulfillment failed for ${event.type}`)
      return NextResponse.json(
        { ok: false, error: "Webhook fulfillment failed", code },
        { status },
      )
    }
  }
}
