import { randomUUID } from "node:crypto"

import { NextRequest, NextResponse } from "next/server"

import { verifyInternalAdminCookie } from "@/app/lib/internal-admin-cookie"
import { buildNativeQuickAuditResult } from "./quick-audit-native"
import { collectQuickAuditEvidence, type QuickAuditEvidence } from "./quick-audit-fulfillment"

const AMS_SITE = "https://www.aspectmarketingsolutions.app"

type Dependencies = {
  env: NodeJS.ProcessEnv
  ownerEmail: (request: NextRequest, secret: string) => Promise<string | null>
  collect: (url: string) => Promise<QuickAuditEvidence>
  uuid: () => string
  now: () => Date
}

const defaults: Dependencies = {
  env: process.env,
  ownerEmail: async (request, secret) => {
    const token = request.cookies.get("ams_internal_admin_access")?.value
    if (!token) return null
    const result = await verifyInternalAdminCookie(token, secret)
    return result?.email ?? null
  },
  collect: collectQuickAuditEvidence,
  uuid: randomUUID,
  now: () => new Date(),
}

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })
}

/**
 * Real public-site evidence collection, with no Stripe, no durable writes,
 * no customer data and no external business account changes.
 * Owner-only and Preview-only; disabled unless explicitly enabled.
 */
export function createOwnerAuditDryRunHandler(overrides: Partial<Dependencies> = {}) {
  const deps = { ...defaults, ...overrides }
  return async function POST(request: NextRequest) {
    const env = deps.env
    if (env.VERCEL_ENV !== "preview" ||
      env.AMS_QUICK_AUDIT_OWNER_DRY_RUN_ENABLED !== "true") {
      return response({ ok: false, code: "AMS_SELF_AUDIT_DISABLED" }, 404)
    }
    const secret = env.INTERNAL_ADMIN_SECRET?.trim()
    const pilotEmail = env.AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL?.trim().toLowerCase()
    const operatorEmail = (env.AMS_OWNER_EMAIL ?? env.INTERNAL_ADMIN_EMAIL)?.trim().toLowerCase()
    if (!secret || !pilotEmail || operatorEmail !== pilotEmail) {
      return response({ ok: false, code: "AMS_SELF_AUDIT_NOT_CONFIGURED" }, 404)
    }
    const signedEmail = await deps.ownerEmail(request, secret)
    if (signedEmail?.trim().toLowerCase() !== pilotEmail) {
      return response({ ok: false, code: "AMS_SELF_AUDIT_FORBIDDEN" }, 403)
    }
    const hostname = env.VERCEL_URL?.trim().toLowerCase()
    const expectedOrigin = hostname && /^[-a-z0-9.]+\.vercel\.app$/.test(hostname) ? `https://${hostname}` : null
    if (!expectedOrigin || request.nextUrl.origin !== expectedOrigin ||
      request.headers.get("origin") !== expectedOrigin) {
      return response({ ok: false, code: "AMS_SELF_AUDIT_ORIGIN" }, 403)
    }
    try {
      const evidence = await deps.collect(AMS_SITE)
      const result = buildNativeQuickAuditResult({
        businessName: "Aspect Marketing Solutions",
        websiteUrl: AMS_SITE,
        industry: "Marketing SaaS and business services",
        goals: "Make the AMS Quick Marketing Audit clearer and easier to purchase",
        notes: "Owner-only, public-site dry run. Automated observations must be reviewed visually.",
        requestId: `ams-owner-dry-run-${deps.uuid()}`,
        evidence,
        now: deps.now,
      })
      return response({
        ok: true,
        mode: "preview-dry-run",
        warning: "Unreviewed automated public HTML signals and strategic suggestions only. Not a paid customer audit or verified business outcome.",
        result,
      }, 200)
    } catch {
      return response({ ok: false, code: "AMS_SELF_AUDIT_EVIDENCE_UNAVAILABLE" }, 503)
    }
  }
}
