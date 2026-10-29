/**
 * Owner-only, READ-ONLY proof that AMS Preview can read the historic
 * Stripe-origin gateway receipt using its OWN isolated Upstash binding.
 * Historical receipt is not an audit-eligible payment/fulfillment proof.
 *
 * No feature flag, token, payment, Redis record, event or email is mutated.
 */
import { NextRequest, NextResponse } from "next/server"
import { Redis } from "@upstash/redis"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { pilotStorageConfiguration } from "@/lib/server/quick-audit-isolated-stripe-pilot"
import { RESEND_PREVIEW_BRANCH } from "@/lib/server/quick-audit-resend-preview-preflight"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const STRIPE_TEST_DB_URL = "https://internal-chicken-238070.upstash.io"
const HISTORICAL_EVENT = "evt_1UUc73GuhFCl8JHaSlyFsJ0n"
const HISTORICAL_SESSION = "cs_test_a1tkmuuIstdaF0nqCzyMzyQ9vYa6FdZ4IG2JhEdxBKbbKXAQKtEbzEc4R1"
const HISTORICAL_KEY = "ams:preview:stripe-gateway:pr300:event:" + HISTORICAL_EVENT
const MUST_REMAIN_OFF = [
  "AMS_STRIPE_PILOT_HANDOFF_ENABLED",
  "AMS_STRIPE_PILOT_CHECKOUT_ENABLED",
  "AMS_STRIPE_PILOT_FULFILLMENT_ENABLED",
  "AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED",
  "AMS_QUICK_AUDIT_PILOT_DISPATCH_ENABLED",
  "AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED",
  "AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED",
] as const

function answer(status: number, code: string, historicalSharedReadVerified = false) {
  return NextResponse.json({
    ok: status === 200, code, historicalSharedReadVerified,
    newPaidAuditVerified: false, stripeOriginRetryVerified: false,
    paymentPerformed: false, emailSent: false, productionChanged: false,
  }, { status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } })
}

export async function GET(request: NextRequest) {
  // Read-only GET has no Origin header on ordinary owner mobile navigation.
  const owner = await authorizeOwnerApiRequest(request)
  if (!owner.ok) return answer(owner.status, owner.code)

  const env = process.env
  if (env.VERCEL_ENV !== "preview" ||
      env.VERCEL_GIT_COMMIT_REF !== RESEND_PREVIEW_BRANCH ||
      MUST_REMAIN_OFF.some(key => env[key] === "true")) {
    return answer(503, "OWNER_RECEIPT_CHECK_CLOSED")
  }

  const scope = pilotStorageConfiguration(env)
  if (!scope.ready ||
      env.AMS_STRIPE_PILOT_REDIS_REST_URL !== STRIPE_TEST_DB_URL) {
    return answer(503, "ISOLATED_PAYMENT_DATABASE_SCOPE_UNVERIFIED")
  }

  try {
    const redis = new Redis({
      url: env.AMS_STRIPE_PILOT_REDIS_REST_URL,
      token: env.AMS_STRIPE_PILOT_REDIS_REST_TOKEN!,
    })
    const value: unknown = await redis.get(HISTORICAL_KEY)
    const receipt: unknown = typeof value === "string" ? JSON.parse(value) : value
    if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
      return answer(404, "HISTORICAL_GATEWAY_RECEIPT_UNAVAILABLE")
    }
    const data = receipt as Record<string, unknown>
    if (data.id !== HISTORICAL_EVENT ||
        data.checkoutSessionId !== HISTORICAL_SESSION ||
        data.type !== "checkout.session.completed" ||
        data.livemode !== false ||
        typeof data.digest !== "string" ||
        !/^[a-f0-9]{64}$/u.test(data.digest)) {
      return answer(409, "HISTORICAL_GATEWAY_RECEIPT_MISMATCH")
    }
    return answer(200, "SHARED_TEST_REDIS_RECEIPT_READ_PASSED", true)
  } catch {
    return answer(503, "SHARED_TEST_REDIS_READ_FAILED")
  }
}
export function POST() { return answer(405, "READ_ONLY_GET_ONLY") }
