import { randomUUID } from "node:crypto"

import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

import { verifyInternalAdminCookie } from "@/app/lib/internal-admin-cookie"
import { resolvePublicAppUrl } from "./stripe-entitlements"

type Dependencies = {
  env: NodeJS.ProcessEnv
  idFactory: () => string
  verifyAdminCookie: (token: string | undefined, secret: string) => Promise<{ email?: string } | null>
  createSession: (
    secretKey: string,
    params: Stripe.Checkout.SessionCreateParams,
    options: Stripe.RequestOptions,
  ) => Promise<Pick<Stripe.Checkout.Session, "id" | "url" | "livemode">>
}

const defaults: Dependencies = {
  env: process.env,
  idFactory: randomUUID,
  verifyAdminCookie: verifyInternalAdminCookie,
  createSession: async (secretKey, params, options) =>
    new Stripe(secretKey).checkout.sessions.create(params, options),
}

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

async function isAuthorized(request: NextRequest, dependencies: Dependencies) {
  const expectedSecret = dependencies.env.INTERNAL_ADMIN_SECRET?.trim()
  if (!expectedSecret) return false
  const token = request.cookies.get("ams_internal_admin_access")?.value
  const session = await dependencies.verifyAdminCookie(token, expectedSecret)
  return Boolean(session?.email)
}

export function createQuickAuditTestCheckoutHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }

  return async function POST(request: NextRequest) {
    if (!(await isAuthorized(request, dependencies))) {
      return noStoreJson(
        { ok: false, error: "Internal admin authentication required", code: "QUICK_AUDIT_TEST_UNAUTHORIZED" },
        401,
      )
    }

    const secretKey = dependencies.env.AMS_STRIPE_QUICK_AUDIT_SECRET_KEY?.trim()
    const priceId = dependencies.env.AMS_STRIPE_QUICK_AUDIT_PRICE_ID?.trim()
    if (!secretKey || !/^(sk|rk)_test_/.test(secretKey) || !priceId?.startsWith("price_")) {
      return noStoreJson(
        { ok: false, error: "Stripe test configuration is unavailable", code: "QUICK_AUDIT_TEST_UNCONFIGURED" },
        503,
      )
    }

    const requestId = `quick-audit-e2e-${dependencies.idFactory()}`
    const publicUrl = resolvePublicAppUrl({ env: dependencies.env, requestOrigin: request.nextUrl.origin })

    try {
      const session = await dependencies.createSession(
        secretKey,
        {
          mode: "payment",
          payment_method_types: ["card"],
          line_items: [{ price: priceId, quantity: 1 }],
          success_url: `${publicUrl}/quick-marketing-audit/thanks?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${publicUrl}/dashboard/quick-audit-test`,
          customer_creation: "always",
          customer_email: "quick-audit-e2e@example.com",
          billing_address_collection: "auto",
          automatic_tax: { enabled: false },
          allow_promotion_codes: false,
          metadata: {
            ams_offer: "quick-marketing-audit",
            ams_request_id: requestId,
            ams_business_name: "Aspect Marketing Solutions E2E Fixture",
            ams_website_url: "https://www.aspectmarketingsolutions.app",
            ams_industry: "Marketing automation",
            ams_goals: "Verify the native Quick Audit fulfillment path end to end",
            ams_notes: "Controlled Stripe test-mode E2E. No customer data.",
            ams_environment: "test-e2e",
          },
        },
        { idempotencyKey: requestId },
      )

      if (session.livemode || !session.id.startsWith("cs_test_") || !session.url) {
        return noStoreJson(
          { ok: false, error: "Stripe did not return a safe test Checkout Session", code: "QUICK_AUDIT_TEST_MODE_MISMATCH" },
          502,
        )
      }

      return noStoreJson({ ok: true, sessionId: session.id, url: session.url })
    } catch {
      return noStoreJson(
        { ok: false, error: "Stripe test Checkout Session could not be created", code: "QUICK_AUDIT_TEST_CHECKOUT_FAILED" },
        502,
      )
    }
  }
}
