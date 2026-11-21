import { NextRequest, NextResponse } from "next/server"

import { verifyInternalAdminCookie } from "@/app/lib/internal-admin-cookie"

export type PilotGate = {
  id: string
  label: string
  configured: boolean
  explanation: string
}

/** Configuration check only. It cannot certify Stripe webhook delivery or Redis persistence. */
export function inspectAuditOwnerPilotConfiguration(env: NodeJS.ProcessEnv): PilotGate[] {
  const testKey = /^(sk|rk)_test_/.test(env.AMS_STRIPE_QUICK_AUDIT_SECRET_KEY?.trim() ?? "")
  const webhookSecret = env.AMS_STRIPE_QUICK_AUDIT_WEBHOOK_SECRET?.trim() ||
    (env.AMS_STRIPE_WEBHOOK_MODE?.trim().toLowerCase() === "test"
      ? env.STRIPE_WEBHOOK_SECRET?.trim()
      : "")
  const ownerEmail = env.AMS_OWNER_EMAIL?.trim().toLowerCase() ??
    env.INTERNAL_ADMIN_EMAIL?.trim().toLowerCase()
  const pilotEmail = env.AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL?.trim().toLowerCase()
  return [
    {
      id: "preview",
      label: "Vercel Preview environment",
      configured: env.VERCEL_ENV === "preview",
      explanation: "The pilot cannot run in production, even when its feature flag is set.",
    },
    {
      id: "owner",
      label: "Owner session and allowlisted identity",
      configured: Boolean(ownerEmail && pilotEmail && ownerEmail === pilotEmail &&
        env.INTERNAL_ADMIN_SECRET?.trim() &&
        env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim() &&
        env.NEXTAUTH_SECRET?.trim()),
      explanation: "Owner allowlist, signed internal admin session, and preview-authorized Google OAuth must be available.",
    },
    {
      id: "stripe",
      label: "Stripe test-mode checkout",
      configured: Boolean(testKey && env.AMS_STRIPE_QUICK_AUDIT_PRICE_ID?.startsWith("price_") &&
        env.AMS_QUICK_AUDIT_OWNER_PILOT_COUPON_ID?.startsWith("coupon_")),
      explanation: "The verified $49 test price and one-use test coupon must match the configured Stripe test account.",
    },
    {
      id: "webhook",
      label: "Stripe test-mode signature configuration",
      configured: Boolean(testKey && webhookSecret?.startsWith("whsec_")),
      explanation: "This checks only the presence of a test webhook signing secret, not endpoint delivery.",
    },
    {
      id: "storage",
      label: "Preview Redis credentials",
      configured: Boolean((env.UPSTASH_REDIS_REST_URL?.trim() && env.UPSTASH_REDIS_REST_TOKEN?.trim()) ||
        (env.KV_REST_API_URL?.trim() && env.KV_REST_API_TOKEN?.trim())),
      explanation: "Presence does not establish database isolation or successful persistence. Verify independently before enabling.",
    },
    {
      id: "fulfillment",
      label: "Fulfillment readiness interlock",
      configured: env.AMS_QUICK_AUDIT_FULFILLMENT_READY === "true",
      explanation: "Keep OFF until the signed webhook and result storage complete isolated tests.",
    },
    {
      id: "checkout",
      label: "Private pilot checkout enablement",
      configured: env.AMS_QUICK_AUDIT_OWNER_PILOT_ENABLED === "true",
      explanation: "Keep OFF until every other prerequisite and independent smoke test passes.",
    },
  ]
}

type Deps = {
  env: NodeJS.ProcessEnv
  verifyOwner: (request: NextRequest, secret: string) => Promise<string | null>
}

const defaults: Deps = {
  env: process.env,
  verifyOwner: async (request, secret) => {
    const token = request.cookies.get("ams_internal_admin_access")?.value
    const session = await verifyInternalAdminCookie(token, secret)
    return session?.email ?? null
  },
}

/** Owner-only, read-only diagnostic. Never emits credentials, tokens or PII. */
export function createAuditOwnerPilotReadinessHandler(overrides: Partial<Deps> = {}) {
  const deps = { ...defaults, ...overrides }
  return async function GET(request: NextRequest) {
    const env = deps.env
    const headers = { "Cache-Control": "no-store" }
    if (env.VERCEL_ENV !== "preview") {
      return NextResponse.json({ ok: false, code: "PILOT_PREVIEW_ONLY" }, { status: 404, headers })
    }
    const secret = env.INTERNAL_ADMIN_SECRET?.trim()
    const owner = env.AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL?.trim().toLowerCase()
    if (!secret || !owner) {
      return NextResponse.json({ ok: false, code: "PILOT_NOT_CONFIGURED" }, { status: 403, headers })
    }
    const verifiedEmail = await deps.verifyOwner(request, secret)
    if (!verifiedEmail || verifiedEmail.trim().toLowerCase() !== owner) {
      return NextResponse.json({ ok: false, code: "PILOT_NOT_AUTHORIZED" }, { status: 403, headers })
    }
    const gates = inspectAuditOwnerPilotConfiguration(env)
    return NextResponse.json({
      ok: true,
      readyForConfigurationReview: gates.every(g => g.configured),
      warning: "Configuration signals only. A paid Stripe webhook, isolated Redis persistence and professional audit QA must each pass independently.",
      gates,
    }, { headers })
  }
}
