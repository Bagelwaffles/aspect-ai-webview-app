import Stripe from "stripe"

import { listRecentFiverrOperations } from "@/lib/server/fiverr-operations"
import { checkRedisReadiness } from "@/lib/server/redis-readiness"

const N8N_TIMEOUT_MS = 4_000
const STRIPE_WINDOW_DAYS = 30
const STRIPE_MAX_PAGES = 5

export type N8nTelemetry = {
  configured: boolean
  online: boolean
  latencyMs: number | null
  statusCode: number | null
  host: string | null
  error: string | null
}

export type StripeTelemetry = {
  configured: boolean
  connected: boolean
  mode: "live" | "test" | "unknown"
  currency: string | null
  grossCapturedCents: number | null
  refundedCents: number | null
  netCapturedCents: number | null
  successfulCharges: number | null
  windowDays: number
  partial: boolean
  error: string | null
}

function modeFromStripeKey(value: string): StripeTelemetry["mode"] {
  if (value.startsWith("sk_live_")) return "live"
  if (value.startsWith("sk_test_")) return "test"
  return "unknown"
}

function safeHost(raw: string): string | null {
  try {
    return new URL(raw).host
  } catch {
    return null
  }
}

export async function probeN8nTelemetry(): Promise<N8nTelemetry> {
  const rawBaseUrl = process.env.AMS_N8N_URL?.trim()
  if (!rawBaseUrl) {
    return {
      configured: false,
      online: false,
      latencyMs: null,
      statusCode: null,
      host: null,
      error: "Not configured",
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), N8N_TIMEOUT_MS)
  const startedAt = Date.now()

  try {
    const response = await fetch(`${rawBaseUrl.replace(/\/$/, "")}/healthz`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    })

    return {
      configured: true,
      online: response.ok,
      latencyMs: Date.now() - startedAt,
      statusCode: response.status,
      host: safeHost(rawBaseUrl),
      error: response.ok ? null : `Health check returned HTTP ${response.status}`,
    }
  } catch {
    return {
      configured: true,
      online: false,
      latencyMs: Date.now() - startedAt,
      statusCode: null,
      host: safeHost(rawBaseUrl),
      error: "Unable to reach n8n health endpoint",
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function getStripeTelemetry(): Promise<StripeTelemetry> {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim()
  if (!secretKey) {
    return {
      configured: false,
      connected: false,
      mode: "unknown",
      currency: null,
      grossCapturedCents: null,
      refundedCents: null,
      netCapturedCents: null,
      successfulCharges: null,
      windowDays: STRIPE_WINDOW_DAYS,
      partial: false,
      error: "Not configured",
    }
  }

  const stripe = new Stripe(secretKey)
  const createdGte = Math.floor((Date.now() - STRIPE_WINDOW_DAYS * 86_400_000) / 1000)
  let startingAfter: string | undefined
  let grossCapturedCents = 0
  let refundedCents = 0
  let successfulCharges = 0
  const currencies = new Set<string>()
  let partial = false

  try {
    for (let pageIndex = 0; pageIndex < STRIPE_MAX_PAGES; pageIndex += 1) {
      const page = await stripe.charges.list({
        limit: 100,
        created: { gte: createdGte },
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      })

      for (const charge of page.data) {
        if (!charge.paid || charge.status !== "succeeded") continue
        successfulCharges += 1
        grossCapturedCents += charge.amount_captured
        refundedCents += charge.amount_refunded
        currencies.add(charge.currency.toLowerCase())
      }

      if (!page.has_more) {
        startingAfter = undefined
        break
      }

      const last = page.data.at(-1)
      if (!last) break
      startingAfter = last.id

      if (pageIndex === STRIPE_MAX_PAGES - 1) partial = true
    }

    return {
      configured: true,
      connected: true,
      mode: modeFromStripeKey(secretKey),
      currency: currencies.size === 1 ? Array.from(currencies)[0] : currencies.size > 1 ? "mixed" : null,
      grossCapturedCents,
      refundedCents,
      netCapturedCents: grossCapturedCents - refundedCents,
      successfulCharges,
      windowDays: STRIPE_WINDOW_DAYS,
      partial,
      error: null,
    }
  } catch {
    return {
      configured: true,
      connected: false,
      mode: modeFromStripeKey(secretKey),
      currency: null,
      grossCapturedCents: null,
      refundedCents: null,
      netCapturedCents: null,
      successfulCharges: null,
      windowDays: STRIPE_WINDOW_DAYS,
      partial: false,
      error: "Stripe reporting request failed",
    }
  }
}

export async function getCommandCenterTelemetry() {
  const [redis, n8n, stripe, fiverrOperations] = await Promise.all([
    checkRedisReadiness(),
    probeN8nTelemetry(),
    getStripeTelemetry(),
    listRecentFiverrOperations(8),
  ])

  return {
    checkedAt: new Date().toISOString(),
    redis,
    n8n,
    stripe,
    fiverr: {
      intakeConfigured: Boolean(process.env.AMS_N8N_INTERNAL_KEY?.trim()),
      recentOperations: fiverrOperations,
    },
  }
}
