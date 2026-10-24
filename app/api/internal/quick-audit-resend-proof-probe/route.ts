/**
 * Owner-only, Preview-only, non-payment storage proof.
 * POST is deliberately inert without a signed AMS owner session, trusted
 * same-origin request, valid branch-scope settings and delivery disabled.
 * Writes one random key (45s TTL), checks it, then removes it.
 * This endpoint does NOT verify the provider, send email, or touch Stripe.
 */
import { NextRequest, NextResponse } from "next/server"
import { Redis } from "@upstash/redis"

import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { inspectResendPreviewPreflight } from "@/lib/server/quick-audit-resend-preview-preflight"
import { runOwnerResendPreviewProofStoreProbe } from "@/lib/server/quick-audit-resend-preview-probe"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeOwnerApiRequest(request, {
    requireTrustedOrigin: true,
  })
  if (!authorization.ok) {
    return json({ ok: false, code: authorization.code }, authorization.status)
  }

  if (inspectResendPreviewPreflight().status !== "configuration-ready") {
    return json({ ok: false, code: "RESEND_PREVIEW_CONFIGURATION_BLOCKED" }, 503)
  }

  const url = process.env.AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL!
  const token = process.env.AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_TOKEN!
  try {
    const redis = new Redis({ url, token })
    const ok = await runOwnerResendPreviewProofStoreProbe(redis)
    return json({
      ok,
      code: ok ? "ISOLATED_NONPAYMENT_PROBE_PASSED" : "ISOLATED_NONPAYMENT_PROBE_FAILED",
      providerVerified: false,
      sendEnabled: false,
      paymentTestPerformed: false,
    }, ok ? 200 : 503)
  } catch {
    return json({
      ok: false,
      code: "ISOLATED_NONPAYMENT_PROBE_UNAVAILABLE",
      providerVerified: false,
      sendEnabled: false,
      paymentTestPerformed: false,
    }, 503)
  }
}
