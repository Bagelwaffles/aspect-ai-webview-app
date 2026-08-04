import { isIP } from "node:net"

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const OFFER_SLUGS = [
  "quick-marketing-audit",
  "social-content-pack",
  "website-profile-review",
  "business-cleanup-plan",
  "monthly-marketing-support",
] as const

const REQUEST_TIMEOUT_MS = 8_000

const offerRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().max(180).email().transform((value) => value.toLowerCase()),
    businessName: z.string().trim().min(1).max(140),
    websiteOrFacebook: z.string().trim().max(240).optional().default(""),
    selectedOffer: z.enum(OFFER_SLUGS),
    notesOrGoals: z.string().trim().min(1).max(2_000).optional(),
    notes: z.string().trim().min(1).max(2_000).optional(),
    consent: z.literal(true),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.notesOrGoals && !value.notes) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["notesOrGoals"],
        message: "Notes or goals are required",
      })
    }
  })
  .transform((value) => ({
    name: value.name,
    email: value.email,
    businessName: value.businessName,
    websiteOrFacebook: value.websiteOrFacebook || null,
    selectedOffer: value.selectedOffer,
    notes: value.notesOrGoals ?? value.notes!,
    consent: true as const,
  }))

type OfferRequestDependencies = {
  env: NodeJS.ProcessEnv
  fetchImpl: typeof fetch
  timeoutMs: number
}

type OfferRequestTestGlobals = typeof globalThis & {
  __amsOfferRequestTestDependencies?: Partial<OfferRequestDependencies>
}

const defaultDependencies: OfferRequestDependencies = {
  env: process.env,
  fetchImpl: fetch,
  timeoutMs: REQUEST_TIMEOUT_MS,
}

function testDependencies(): Partial<OfferRequestDependencies> {
  if (process.env.NODE_ENV === "production") return {}
  return (globalThis as OfferRequestTestGlobals).__amsOfferRequestTestDependencies ?? {}
}

function noStoreJson(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

function isPrivateOrLoopbackHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "")
  const ipVersion = isIP(normalized)

  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    (ipVersion === 0 && !normalized.includes("."))
  ) {
    return true
  }

  if (ipVersion === 4) {
    const [first, second] = normalized.split(".").map(Number)
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    )
  }

  if (ipVersion === 6) {
    const firstHextet = Number.parseInt(normalized.split(":", 1)[0] || "0", 16)
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("::ffff:") ||
      (firstHextet & 0xfe00) === 0xfc00 ||
      (firstHextet & 0xffc0) === 0xfe80
    )
  }

  return false
}

function resolveBackendEndpoint(env: NodeJS.ProcessEnv) {
  const rawBackendUrl = env.AMS_BACKEND_URL?.trim()
  const fulfillmentSecret = env.AMS_STRIPE_FULFILLMENT_SECRET?.trim()
  if (!rawBackendUrl || !fulfillmentSecret) return null

  let backendUrl: URL
  try {
    backendUrl = new URL(rawBackendUrl)
  } catch {
    return null
  }

  const production = env.NODE_ENV === "production"
  if (
    !["http:", "https:"].includes(backendUrl.protocol) ||
    backendUrl.username ||
    backendUrl.password ||
    backendUrl.search ||
    backendUrl.hash ||
    (production && backendUrl.protocol !== "https:") ||
    (production && isPrivateOrLoopbackHostname(backendUrl.hostname))
  ) {
    return null
  }

  backendUrl.pathname = `${backendUrl.pathname.replace(/\/+$/, "")}/internal/ethical-agent-farm/requests`

  return {
    endpoint: backendUrl,
    fulfillmentSecret,
  }
}

async function forwardRequest(
  payload: z.output<typeof offerRequestSchema>,
  dependencies: OfferRequestDependencies,
) {
  const backend = resolveBackendEndpoint(dependencies.env)
  if (!backend) {
    return noStoreJson(
      { ok: false, saved: false, error: "service_request_unavailable" },
      503,
    )
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs)

  try {
    const response = await dependencies.fetchImpl(backend.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ams-fulfillment-secret": backend.fulfillmentSecret,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    })

    await response.body?.cancel().catch(() => undefined)

    if (!response.ok) {
      return noStoreJson(
        { ok: false, saved: false, error: "service_request_upstream_failed" },
        502,
      )
    }

    return noStoreJson(
      {
        ok: true,
        saved: true,
        message: "Request received. We'll review your business and follow up.",
        noPaymentCharged: true,
      },
      200,
    )
  } catch {
    if (controller.signal.aborted) {
      return noStoreJson(
        { ok: false, saved: false, error: "service_request_upstream_timeout" },
        504,
      )
    }

    return noStoreJson(
      { ok: false, saved: false, error: "service_request_upstream_failed" },
      502,
    )
  } finally {
    clearTimeout(timeout)
  }
}

export async function POST(request: NextRequest) {
  const dependencies = { ...defaultDependencies, ...testDependencies() }

  try {
    const parsed = offerRequestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return noStoreJson(
        { ok: false, saved: false, error: "invalid_service_request" },
        400,
      )
    }

    return await forwardRequest(parsed.data, dependencies)
  } catch {
    return noStoreJson(
      { ok: false, saved: false, error: "service_request_failed" },
      500,
    )
  }
}
