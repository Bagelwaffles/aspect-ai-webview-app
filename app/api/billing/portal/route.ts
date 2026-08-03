import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

import { authorizePaidApiRequest } from "@/lib/server/customer-api-auth"
import { getEntitlementSnapshot } from "@/lib/server/entitlements"
import {
  assertStripeSecretKeyMatchesMode,
  resolvePublicAppUrl,
} from "@/lib/server/stripe-entitlements"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type PortalDependencies = {
  authorize: typeof authorizePaidApiRequest
  getEntitlements: typeof getEntitlementSnapshot
  env: NodeJS.ProcessEnv
  createPortalSession: (
    secretKey: string,
    params: Stripe.BillingPortal.SessionCreateParams,
  ) => Promise<Pick<Stripe.BillingPortal.Session, "url">>
}

const defaultDependencies: PortalDependencies = {
  authorize: authorizePaidApiRequest,
  getEntitlements: getEntitlementSnapshot,
  env: process.env,
  createPortalSession: async (secretKey, params) => {
    const stripe = new Stripe(secretKey)
    return stripe.billingPortal.sessions.create(params)
  },
}

type PortalTestGlobals = typeof globalThis & {
  __amsPortalTestDependencies?: Partial<PortalDependencies>
}

function testDependencies(): Partial<PortalDependencies> {
  if (process.env.NODE_ENV === "production") return {}
  return (globalThis as PortalTestGlobals).__amsPortalTestDependencies ?? {}
}

function noStoreJson(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

function createPortalHandler(overrides: Partial<PortalDependencies> = {}) {
  const dependencies = { ...defaultDependencies, ...overrides }

  return async function portalPost(request: NextRequest) {
    const principal = await dependencies.authorize(request)
    if (!principal || principal.kind !== "customer") {
      return noStoreJson(
        { ok: false, error: "A customer session is required", code: "CUSTOMER_SESSION_REQUIRED" },
        401,
      )
    }

    const snapshot = await dependencies.getEntitlements(principal.subject).catch(() => null)
    if (!snapshot?.configured) {
      return noStoreJson(
        { ok: false, error: "Entitlement service is not configured", code: "ENTITLEMENTS_NOT_CONFIGURED" },
        503,
      )
    }
    if (!snapshot.stripeCustomerId) {
      return noStoreJson(
        { ok: false, error: "No Stripe customer exists for this account", code: "STRIPE_CUSTOMER_NOT_FOUND" },
        404,
      )
    }

    const stripeSecretKey = dependencies.env.STRIPE_SECRET_KEY?.trim()
    let publicAppUrl: string
    try {
      if (!stripeSecretKey) throw new Error("PORTAL_CONFIGURATION_MISSING")
      assertStripeSecretKeyMatchesMode(stripeSecretKey, dependencies.env)
      publicAppUrl = resolvePublicAppUrl({
        env: dependencies.env,
        requestOrigin: request.nextUrl.origin,
      })
    } catch {
      return noStoreJson(
        { ok: false, error: "Billing portal is not configured", code: "BILLING_PORTAL_NOT_CONFIGURED" },
        503,
      )
    }

    try {
      const session = await dependencies.createPortalSession(stripeSecretKey, {
        customer: snapshot.stripeCustomerId,
        return_url: `${publicAppUrl}/billing`,
      })

      return NextResponse.json(
        { ok: true, url: session.url },
        { headers: { "Cache-Control": "no-store" } },
      )
    } catch {
      return noStoreJson({ ok: false, error: "Portal failed" }, 502)
    }
  }
}

export async function POST(request: NextRequest) {
  return createPortalHandler(testDependencies())(request)
}
