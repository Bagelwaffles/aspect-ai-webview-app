/**
 * Owner-authenticated, default-OFF, TEST-only secure report-link acceptance.
 * No scheduled dispatch. No arbitrary recipient, amount, message or Stripe ID.
 * The existing #300 receipt-only and owner email paths remain unchanged.
 */
import { Redis } from "@upstash/redis"
import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { dispatchApprovedQuickAuditOwnerPreview } from "@/lib/server/quick-audit-buyer-dispatch"
import { createIsolatedPilotStores } from "@/lib/server/quick-audit-isolated-pilot-stores"
import {
  AMS_PILOT_STRIPE_ACCOUNT,
  pilotDispatchConfiguration,
} from "@/lib/server/quick-audit-isolated-stripe-pilot"
import { createResendAuditSender } from "@/lib/server/quick-audit-resend-sender"
import { PreviewResendDomainProofStore } from "@/lib/server/quick-audit-resend-domain-proof-store"
import { RESEND_PREVIEW_REDIS_HOST } from "@/lib/server/quick-audit-resend-preview-preflight"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(code: string, status: number) {
  return NextResponse.json({ ok: status === 200, code }, {
    status, headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  })
}
function proofStore(env: NodeJS.ProcessEnv) {
  const raw = env.AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL?.trim()
  const token = env.AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_TOKEN?.trim()
  const namespace = env.AMS_QUICK_AUDIT_RESEND_PROOF_NAMESPACE?.trim()
  if (!raw || !token || !namespace) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== "https:" || url.hostname !== RESEND_PREVIEW_REDIS_HOST ||
        url.port || url.username || url.password || url.pathname !== "/" ||
        url.search || url.hash) return null
    return new PreviewResendDomainProofStore(new Redis({ url: raw, token }), namespace)
  } catch { return null }
}

export async function POST(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!auth.ok) return json(auth.code, auth.status)

  const env = process.env
  if (!pilotDispatchConfiguration(env).ready ||
      env.AMS_QUICK_AUDIT_BUYER_DISPATCH_ENABLED !== "true" ||
      env.AMS_QUICK_AUDIT_REPORT_ACCESS_REQUIRED !== "true" ||
      env.AMS_QUICK_AUDIT_PILOT_BUYER_RESULT_ENABLED !== "true" ||
      !env.AMS_STRIPE_PILOT_TEST_SECRET_KEY?.startsWith("sk_test_")) {
    return json("PILOT_BUYER_LINK_DISPATCH_DISABLED", 503)
  }

  // Body is the ID of an *existing* queued owner TEST audit only. No incoming
  // recipient, session ID, price, token, sender or message content is allowed.
  const raw = await request.text().catch(() => "")
  if (!raw || Buffer.byteLength(raw, "utf8") > 256) {
    return json("PILOT_BUYER_LINK_INPUT_INVALID", 400)
  }
  let body: unknown
  try { body = JSON.parse(raw) } catch { return json("PILOT_BUYER_LINK_INPUT_INVALID", 400) }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      !("requestId" in body) ||
      typeof body.requestId !== "string" ||
      !/^quick-audit-[A-Za-z0-9_-]{8,190}$/.test(body.requestId)) {
    return json("PILOT_BUYER_LINK_INPUT_INVALID", 400)
  }

  try {
    const stripe = new Stripe(env.AMS_STRIPE_PILOT_TEST_SECRET_KEY!)
    const account = await stripe.accounts.retrieve()
    if (account.id !== AMS_PILOT_STRIPE_ACCOUNT) return json("PILOT_BUYER_LINK_ACCOUNT_DENIED", 503)

    const stores = createIsolatedPilotStores(env, undefined, "dispatch")
    const proofs = proofStore(env)
    if (!stores || !proofs) return json("PILOT_BUYER_LINK_STORAGE_UNAVAILABLE", 503)
    const sender = createResendAuditSender({
      env,
      readDomainProof: () => proofs.readDomainProof(),
    })
    const status = await dispatchApprovedQuickAuditOwnerPreview({
      requestId: body.requestId,
      env,
      outbox: stores.outbox,
      reports: stores.reports,
      proof: stores.paymentProof,
      stripe: {
        retrieveCheckoutSession: id => stripe.checkout.sessions.retrieve(id),
        listLineItems: id => stripe.checkout.sessions.listLineItems(id, { limit: 10 }),
      },
      sender,
    })

    // Provider accepted means submitted, NOT inbox delivered. Never auto-retry.
    return json("PILOT_BUYER_LINK_" + status.toUpperCase(), status === "submitted" ? 200 : 503)
  } catch {
    // Never print Stripe tokens, bearer URLs, buyer addresses or provider bodies.
    return json("PILOT_BUYER_LINK_DISPATCH_BLOCKED", 503)
  }
}
export async function GET() {
  return NextResponse.json({ ok: false, code: "PILOT_BUYER_LINK_POST_ONLY" }, {
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "no-store" },
  })
}
