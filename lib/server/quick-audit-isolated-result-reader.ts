/**
 * Isolated TEST sandbox report reader used only by the protected integration
 * Preview. No route exposes a token mint, no LIVE or customer emails are sent.
 *
 * This permits a 14-day buyer-link to retrieve the same result stored in the
 * dedicated pilot Redis after the short dispatch window has expired.
 */
import { Redis } from "@upstash/redis"
import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

import { type QuickAuditResultStore, RedisQuickAuditResultStore } from "./quick-audit-native"
import { createQuickAuditResultHandler } from "./quick-audit-result"
import { AMS_PILOT_STRIPE_ACCOUNT, pilotStorageConfiguration } from "./quick-audit-isolated-stripe-pilot"
import { RESEND_PREVIEW_BRANCH } from "./quick-audit-resend-preview-preflight"

type PilotStripe = Pick<Stripe, "accounts" | "checkout">
type Deps = {
  env: NodeJS.ProcessEnv
  makeStripe: (key: string) => PilotStripe
  makeStore: (env: NodeJS.ProcessEnv) => QuickAuditResultStore
}
const defaults: Deps = {
  env: process.env,
  makeStripe: key => new Stripe(key),
  makeStore: env => new RedisQuickAuditResultStore(new Redis({
    url: env.AMS_STRIPE_PILOT_REDIS_REST_URL!,
    token: env.AMS_STRIPE_PILOT_REDIS_REST_TOKEN!,
  })),
}
function blocked(code: string) {
  return NextResponse.json({ ok: false, code }, {
    status: 503, headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  })
}

/** Return null to preserve the *existing* generic route when pilot mode is OFF. */
export function createIsolatedPilotBuyerResultHandler(overrides: Partial<Deps> = {}) {
  const deps = { ...defaults, ...overrides }
  return async (request: NextRequest): Promise<NextResponse | null> => {
    const id = request.nextUrl.searchParams.get("session_id") ?? ""
    if (!id.startsWith("cs_test_") ||
        deps.env.AMS_QUICK_AUDIT_PILOT_BUYER_RESULT_ENABLED !== "true") return null

    // Every prerequisite is checked before reading the isolated Redis or
    // talking to Stripe, even if the 10-minute dispatch window expired.
    if (deps.env.VERCEL_ENV !== "preview" ||
        deps.env.VERCEL_GIT_COMMIT_REF !== RESEND_PREVIEW_BRANCH ||
        deps.env.AMS_QUICK_AUDIT_REPORT_ACCESS_REQUIRED !== "true" ||
        !pilotStorageConfiguration(deps.env).ready ||
        deps.env.AMS_STRIPE_PILOT_ACCOUNT_ID !== AMS_PILOT_STRIPE_ACCOUNT ||
        !/^(?:sk|rk)_test_[A-Za-z0-9_]{8,}$/.test(deps.env.AMS_STRIPE_PILOT_TEST_SECRET_KEY ?? "") ||
        !/^price_[A-Za-z0-9]{8,200}$/.test(deps.env.AMS_STRIPE_PILOT_PRICE_ID ?? "") ||
        !deps.env.AMS_QUICK_AUDIT_REPORT_ACCESS_SECRET ||
        deps.env.AMS_QUICK_AUDIT_REPORT_ACCESS_SECRET.trim().length < 32) {
      return blocked("PILOT_BUYER_RESULT_DISABLED")
    }

    try {
      const stripe = deps.makeStripe(deps.env.AMS_STRIPE_PILOT_TEST_SECRET_KEY!)
      const account = await stripe.accounts.retrieve()
      if (account.id !== AMS_PILOT_STRIPE_ACCOUNT) return blocked("PILOT_BUYER_ACCOUNT_UNVERIFIED")

      const resultHandler = createQuickAuditResultHandler({
        env: {
          ...deps.env,
          AMS_STRIPE_QUICK_AUDIT_SECRET_KEY: deps.env.AMS_STRIPE_PILOT_TEST_SECRET_KEY,
          AMS_STRIPE_QUICK_AUDIT_PRICE_ID: deps.env.AMS_STRIPE_PILOT_PRICE_ID,
          AMS_QUICK_AUDIT_REPORT_ACCESS_REQUIRED: "true",
        },
        createStripe: () => stripe as Stripe,
        store: deps.makeStore(deps.env),
      })
      return resultHandler(request)
    } catch {
      return blocked("PILOT_BUYER_RESULT_UNAVAILABLE")
    }
  }
}
