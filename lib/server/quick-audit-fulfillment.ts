import { isIP } from "node:net"

import { Redis } from "@upstash/redis"
import type Stripe from "stripe"

const QUICK_AUDIT_TIMEOUT_MS = 8_000
const MAX_HTML_BYTES = 1_000_000
const RECORD_TTL_SECONDS = 60 * 60 * 24 * 90

export type QuickAuditEvidence = Record<string, boolean | null>

export type QuickAuditRecord = {
  status: "completed"
  checkoutSessionId: string
  stripeEventId: string
  requestId: string
  n8nAuditId: string
  completedAt: string
}

export interface QuickAuditStore {
  reserve(input: { checkoutSessionId: string; stripeEventId: string; requestId: string }): Promise<
    | { state: "reserved"; token: string }
    | { state: "duplicate"; record: QuickAuditRecord }
    | { state: "processing" }
    | { state: "conflict" }
  >
  complete(input: QuickAuditRecord & { token: string }): Promise<void>
  release(input: { checkoutSessionId: string; token: string }): Promise<void>
}

export interface QuickAuditStripeGateway {
  retrieveCheckoutSession(id: string): Promise<Stripe.Checkout.Session>
  listLineItems(id: string): Promise<Stripe.ApiList<Stripe.LineItem>>
}

export interface QuickAuditAuditGateway {
  run(input: {
    businessName: string
    websiteUrl: string
    industry: string
    goals: string
    notes: string
    requestId: string
    evidence: QuickAuditEvidence
  }): Promise<{ auditId: string }>
}

export type QuickAuditProcessingResult = {
  processed: boolean
  applied: boolean
  reason: string
  duplicate?: boolean
  requestId?: string
  n8nAuditId?: string
}

export class QuickAuditFulfillmentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: 400 | 409 | 500 | 502 | 503 | 504 = 500,
  ) {
    super(message)
    this.name = "QuickAuditFulfillmentError"
  }
}

type RedisClient = {
  eval(script: string, keys: string[], args: unknown[]): Promise<unknown>
}

function redisClient(): RedisClient | null {
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)?.trim()
  return url && token ? new Redis({ url, token }) : null
}

const RESERVE_SCRIPT = `
local existing = redis.call('GET', KEYS[1])
if existing then return existing end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2], 'NX')
return ''
`

const COMPLETE_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
local decoded = cjson.decode(current)
if decoded.token ~= ARGV[1] then return -1 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
redis.call('SET', KEYS[2], ARGV[4], 'EX', ARGV[3])
redis.call('SET', KEYS[3], ARGV[4], 'EX', ARGV[3])
redis.call('SET', KEYS[4], ARGV[4], 'EX', ARGV[3])
return 1
`

export class RedisQuickAuditStore implements QuickAuditStore {
  constructor(private readonly redis: RedisClient | null = redisClient()) {}

  async reserve(input: { checkoutSessionId: string; stripeEventId: string; requestId: string }) {
    if (!this.redis) throw new QuickAuditFulfillmentError("QUICK_AUDIT_STORE_UNAVAILABLE", "Quick Audit storage is unavailable", 503)
    const token = crypto.randomUUID()
    const pending = { status: "processing", ...input, token }
    const raw = await this.redis.eval(
      RESERVE_SCRIPT,
      [`ams:quick-audit:session:${input.checkoutSessionId}`],
      [JSON.stringify(pending), String(RECORD_TTL_SECONDS)],
    )
    if (!raw) return { state: "reserved" as const, token }
    const existing = JSON.parse(String(raw)) as Partial<QuickAuditRecord> & { status?: string; token?: string }
    if (existing.requestId !== input.requestId) return { state: "conflict" as const }
    if (existing.status === "completed") return { state: "duplicate" as const, record: existing as QuickAuditRecord }
    return { state: "processing" as const }
  }

  async complete(input: QuickAuditRecord & { token: string }) {
    if (!this.redis) throw new QuickAuditFulfillmentError("QUICK_AUDIT_STORE_UNAVAILABLE", "Quick Audit storage is unavailable", 503)
    const record: QuickAuditRecord = {
      status: input.status,
      checkoutSessionId: input.checkoutSessionId,
      stripeEventId: input.stripeEventId,
      requestId: input.requestId,
      n8nAuditId: input.n8nAuditId,
      completedAt: input.completedAt,
    }
    const result = await this.redis.eval(
      COMPLETE_SCRIPT,
      [
        `ams:quick-audit:session:${input.checkoutSessionId}`,
        `ams:quick-audit:event:${input.stripeEventId}`,
        `ams:quick-audit:request:${input.requestId}`,
        `ams:quick-audit:audit:${input.n8nAuditId}`,
      ],
      [input.token, JSON.stringify(record), String(RECORD_TTL_SECONDS), input.checkoutSessionId],
    )
    if (Number(result) !== 1) throw new QuickAuditFulfillmentError("QUICK_AUDIT_CLAIM_LOST", "Quick Audit claim ownership was lost", 503)
  }

  async release(input: { checkoutSessionId: string; token: string }) {
    if (!this.redis) return
    await this.redis.eval(
      "local v=redis.call('GET',KEYS[1]); if not v then return 0 end; local d=cjson.decode(v); if d.token==ARGV[1] and d.status=='processing' then return redis.call('DEL',KEYS[1]) end; return 0",
      [`ams:quick-audit:session:${input.checkoutSessionId}`],
      [input.token],
    )
  }
}

function metadataValue(metadata: Stripe.Metadata | null, key: string, max: number) {
  const value = metadata?.[key]?.trim() ?? ""
  if (!value || value.length > max) throw new QuickAuditFulfillmentError("QUICK_AUDIT_INTAKE_INVALID", "Quick Audit intake metadata is invalid", 400)
  return value
}

function isPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  const version = isIP(normalized)
  if (normalized === "localhost" || normalized.endsWith(".local") || normalized.endsWith(".internal")) return true
  if (version === 4) {
    const [a, b] = normalized.split(".").map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  }
  return version === 6 && (normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8"))
}

function publicAuditUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new QuickAuditFulfillmentError(
      "QUICK_AUDIT_WEBSITE_INVALID",
      "Website URL is invalid",
      400,
    )
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    isPrivateHostname(url.hostname)
  ) {
    throw new QuickAuditFulfillmentError(
      "QUICK_AUDIT_WEBSITE_UNSAFE",
      "Website URL is not publicly reachable",
      400,
    )
  }

  return url
}

export async function collectQuickAuditEvidence(
  websiteUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<QuickAuditEvidence> {
  let url = publicAuditUrl(websiteUrl)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), QUICK_AUDIT_TIMEOUT_MS)

  try {
    let response: Response | null = null

    for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
      response = await fetchImpl(url, {
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
      })

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location")
        if (!location) {
          throw new QuickAuditFulfillmentError(
            "QUICK_AUDIT_REDIRECT_INVALID",
            "Website returned an invalid redirect",
            502,
          )
        }

        if (redirectCount === 5) {
          throw new QuickAuditFulfillmentError(
            "QUICK_AUDIT_REDIRECT_LIMIT",
            "Website redirected too many times",
            502,
          )
        }

        url = publicAuditUrl(new URL(location, url).toString())
        continue
      }

      break
    }

    if (!response?.ok) {
      throw new QuickAuditFulfillmentError(
        "QUICK_AUDIT_WEBSITE_FETCH_FAILED",
        "Website evidence could not be collected",
        502,
      )
    }

    const html = (await response.text()).slice(0, MAX_HTML_BYTES)

    return {
      hasClearValueProposition: /<h1\b[^>]*>\s*[^<]{8,}/i.test(html),
      hasPrimaryCta: /<(a|button)\b[^>]*>[^<]*(book|buy|get started|contact|request|schedule|shop)/i.test(html),
      hasContactInfo: /(mailto:|tel:|\bcontact\b)/i.test(html),
      hasLocalBusinessSchema: /["']@type["']\s*:\s*["']localbusiness/i.test(html),
      hasTitleAndMeta: /<title\b[^>]*>\s*[^<]+/i.test(html) && /<meta\b[^>]*name=["']description["']/i.test(html),
      hasRecentContent: null,
      hasTestimonials: /(testimonial|customer review|client review)/i.test(html),
      hasPrivacyPolicy: /(href=["'][^"']*privacy|privacy policy)/i.test(html),
      hasLeadCapture: /<form\b/i.test(html) && /(type=["']email["']|name=["']email["'])/i.test(html),
      hasFollowUpProcess: null,
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new QuickAuditFulfillmentError(
        "QUICK_AUDIT_WEBSITE_TIMEOUT",
        "Website evidence collection timed out",
        504,
      )
    }

    if (error instanceof QuickAuditFulfillmentError) throw error

    throw new QuickAuditFulfillmentError(
      "QUICK_AUDIT_WEBSITE_FETCH_FAILED",
      "Website evidence could not be collected",
      502,
    )
  } finally {
    clearTimeout(timeout)
  }
}

export function createQuickAuditAuditGateway(config: { webhookUrl?: string; internalKey?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {}): QuickAuditAuditGateway {
  return { async run(input) {
    const webhookUrl = config.webhookUrl ?? process.env.AMS_N8N_AUDIT_WEBHOOK_URL
    const internalKey = config.internalKey ?? process.env.AMS_N8N_INTERNAL_KEY
    if (!webhookUrl?.trim() || !internalKey?.trim()) throw new QuickAuditFulfillmentError("QUICK_AUDIT_GATEWAY_UNCONFIGURED", "Quick Audit gateway is not configured", 503)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? QUICK_AUDIT_TIMEOUT_MS)
    try {
      const response = await (config.fetchImpl ?? fetch)(webhookUrl, {
        method: "POST", cache: "no-store", signal: controller.signal,
        headers: { "content-type": "application/json", "x-ams-internal-key": internalKey },
        body: JSON.stringify(input),
      })
      const body = await response.json().catch(() => null) as { auditId?: unknown } | null
      if (!response.ok || typeof body?.auditId !== "string") throw new QuickAuditFulfillmentError("QUICK_AUDIT_N8N_FAILED", "Quick Audit generation failed", 502)
      return { auditId: body.auditId }
    } catch (error) {
      if (controller.signal.aborted) throw new QuickAuditFulfillmentError("QUICK_AUDIT_N8N_TIMEOUT", "Quick Audit generation timed out", 504)
      if (error instanceof QuickAuditFulfillmentError) throw error
      throw new QuickAuditFulfillmentError("QUICK_AUDIT_N8N_FAILED", "Quick Audit generation failed", 502)
    } finally { clearTimeout(timeout) }
  }}
}

export async function processQuickAuditCheckout(input: {
  event: Stripe.Event
  gateway: QuickAuditStripeGateway
  store: QuickAuditStore
  auditGateway: QuickAuditAuditGateway
  evidenceCollector?: (url: string) => Promise<QuickAuditEvidence>
  expectedPriceId: string
  expectedLivemode: boolean
}): Promise<QuickAuditProcessingResult> {
  const eventSession = input.event.data.object as Stripe.Checkout.Session
  if (eventSession.mode !== "payment") return { processed: false, applied: false, reason: "NON_PAYMENT_CHECKOUT_IGNORED" }
  const session = await input.gateway.retrieveCheckoutSession(eventSession.id)
  if (session.livemode !== input.expectedLivemode) throw new QuickAuditFulfillmentError("QUICK_AUDIT_MODE_MISMATCH", "Quick Audit payment mode does not match fulfillment configuration", 400)
  if (session.mode !== "payment" || session.status !== "complete" || session.payment_status !== "paid") {
    throw new QuickAuditFulfillmentError("QUICK_AUDIT_PAYMENT_UNSETTLED", "Quick Audit Checkout Session is not paid and complete", 400)
  }
  if (session.expires_at && session.expires_at <= Math.floor(Date.now() / 1000)) {
    throw new QuickAuditFulfillmentError("QUICK_AUDIT_SESSION_EXPIRED", "Quick Audit Checkout Session is expired", 400)
  }
  const lineItems = await input.gateway.listLineItems(session.id)
  const matching = lineItems.data.filter((item) => item.price?.id === input.expectedPriceId && item.quantity === 1)
  if (matching.length !== 1 || lineItems.data.length !== 1) return { processed: false, applied: false, reason: "UNAPPROVED_ONE_TIME_PRODUCT" }

  const requestId = metadataValue(session.metadata, "ams_request_id", 200)
  const reservation = await input.store.reserve({ checkoutSessionId: session.id, stripeEventId: input.event.id, requestId })
  if (reservation.state === "duplicate") return { processed: true, applied: false, reason: "IDEMPOTENT", duplicate: true, requestId, n8nAuditId: reservation.record.n8nAuditId }
  if (reservation.state === "processing") throw new QuickAuditFulfillmentError("QUICK_AUDIT_IN_PROGRESS", "Quick Audit fulfillment is already processing", 409)
  if (reservation.state === "conflict") throw new QuickAuditFulfillmentError("QUICK_AUDIT_IDEMPOTENCY_CONFLICT", "Quick Audit idempotency conflict", 409)

  try {
    const websiteUrl = metadataValue(session.metadata, "ams_website_url", 2048)
    const result = await input.auditGateway.run({
      businessName: metadataValue(session.metadata, "ams_business_name", 200), websiteUrl,
      industry: metadataValue(session.metadata, "ams_industry", 120),
      goals: metadataValue(session.metadata, "ams_goals", 500),
      notes: session.metadata?.ams_notes?.slice(0, 5000) ?? "",
      requestId,
      evidence: await (input.evidenceCollector ?? collectQuickAuditEvidence)(websiteUrl),
    })
    await input.store.complete({ status: "completed", checkoutSessionId: session.id, stripeEventId: input.event.id, requestId, n8nAuditId: result.auditId, completedAt: new Date().toISOString(), token: reservation.token })
    return { processed: true, applied: true, reason: "QUICK_AUDIT_COMPLETED", requestId, n8nAuditId: result.auditId }
  } catch (error) {
    await input.store.release({ checkoutSessionId: session.id, token: reservation.token }).catch(() => undefined)
    throw error
  }
}
