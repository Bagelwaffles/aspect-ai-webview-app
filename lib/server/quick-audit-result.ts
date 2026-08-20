import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

import {
  RedisQuickAuditResultStore,
  type QuickAuditResultStore,
} from "./quick-audit-native"

type Dependencies = {
  env: NodeJS.ProcessEnv
  createStripe: (secretKey: string) => Stripe
  store: QuickAuditResultStore
}

const defaults: Dependencies = {
  env: process.env,
  createStripe: (secretKey) => new Stripe(secretKey),
  store: new RedisQuickAuditResultStore(),
}

function noStoreJson(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

function validSessionId(value: string | null) {
  return Boolean(value && value.length <= 255 && /^cs_(?:live|test)_[A-Za-z0-9]+$/.test(value))
}

function configurationForSession(env: NodeJS.ProcessEnv, sessionId: string) {
  const live = sessionId.startsWith("cs_live_")
  const secretKey = (live
    ? env.AMS_STRIPE_QUICK_AUDIT_LIVE_SECRET_KEY
    : env.AMS_STRIPE_QUICK_AUDIT_SECRET_KEY)?.trim()
  const priceId = (live
    ? env.AMS_STRIPE_QUICK_AUDIT_LIVE_PRICE_ID
    : env.AMS_STRIPE_QUICK_AUDIT_PRICE_ID)?.trim()
  const expectedPrefix = live ? /^(sk|rk)_live_/ : /^(sk|rk)_test_/
  if (!secretKey || !expectedPrefix.test(secretKey) || !priceId?.startsWith("price_")) return null
  return { secretKey, priceId, livemode: live }
}

export function createQuickAuditResultHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }

  return async function GET(request: NextRequest) {
    const sessionId = request.nextUrl.searchParams.get("session_id")?.trim() ?? null
    if (!validSessionId(sessionId)) {
      return noStoreJson(
        { ok: false, error: "A valid checkout session is required", code: "QUICK_AUDIT_SESSION_REQUIRED" },
        400,
      )
    }

    const config = configurationForSession(dependencies.env, sessionId!)
    if (!config) {
      return noStoreJson(
        { ok: false, error: "Quick Audit result access is unavailable", code: "QUICK_AUDIT_RESULT_UNCONFIGURED" },
        503,
      )
    }

    try {
      const stripe = dependencies.createStripe(config.secretKey)
      const session = await stripe.checkout.sessions.retrieve(sessionId!)
      if (
        session.livemode !== config.livemode ||
        session.mode !== "payment" ||
        session.status !== "complete" ||
        session.payment_status !== "paid" ||
        session.metadata?.ams_offer !== "quick-marketing-audit"
      ) {
        return noStoreJson(
          { ok: false, error: "Paid Quick Audit session was not verified", code: "QUICK_AUDIT_SESSION_NOT_VERIFIED" },
          403,
        )
      }

      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 })
      const matching = lineItems.data.filter((item) => item.price?.id === config.priceId && item.quantity === 1)
      if (matching.length !== 1 || lineItems.data.length !== 1) {
        return noStoreJson(
          { ok: false, error: "Quick Audit purchase was not verified", code: "QUICK_AUDIT_PRICE_NOT_VERIFIED" },
          403,
        )
      }

      const requestId = session.metadata?.ams_request_id?.trim()
      if (!requestId || requestId.length > 200) {
        return noStoreJson(
          { ok: false, error: "Quick Audit request was not verified", code: "QUICK_AUDIT_REQUEST_NOT_VERIFIED" },
          403,
        )
      }

      const result = await dependencies.store.getByRequestId(requestId)
      if (!result) {
        return noStoreJson(
          { ok: true, status: "processing" },
          202,
        )
      }

      return noStoreJson(
        {
          ok: true,
          status: "completed",
          result,
        },
        200,
      )
    } catch (error) {
      if (error instanceof Error && error.message === "QUICK_AUDIT_RESULT_STORE_UNAVAILABLE") {
        return noStoreJson(
          { ok: false, error: "Quick Audit result storage is unavailable", code: "QUICK_AUDIT_RESULT_STORE_UNAVAILABLE" },
          503,
        )
      }
      return noStoreJson(
        { ok: false, error: "Quick Audit result could not be verified", code: "QUICK_AUDIT_RESULT_LOOKUP_FAILED" },
        502,
      )
    }
  }
}
