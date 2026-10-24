/**
 * Authenticated one-request owner-only Preview delivery gateway.
 * Disabled unless separately armed and isolated fulfillment has been proven.
 * No automatic polling, retry, arbitrary recipient or default Redis fallback.
 */
import { Redis } from "@upstash/redis"
import { NextRequest, NextResponse } from "next/server"

import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { createIsolatedPilotStores } from "@/lib/server/quick-audit-isolated-pilot-stores"
import { pilotDispatchConfiguration } from "@/lib/server/quick-audit-isolated-stripe-pilot"
import { deliverQuickAuditOwnerPreview } from "@/lib/server/quick-audit-delivery-worker"
import { createResendAuditSender } from "@/lib/server/quick-audit-resend-sender"
import { PreviewResendDomainProofStore } from "@/lib/server/quick-audit-resend-domain-proof-store"
import { RESEND_PREVIEW_REDIS_HOST } from "@/lib/server/quick-audit-resend-preview-preflight"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function json(code: string, status: number) {
  return NextResponse.json({ ok: status === 200, code }, {
    status, headers: { "Cache-Control": "no-store" },
  })
}

function previewDomainProofStore(env: NodeJS.ProcessEnv) {
  const raw = env.AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL?.trim()
  const token = env.AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_TOKEN?.trim()
  const ns = env.AMS_QUICK_AUDIT_RESEND_PROOF_NAMESPACE?.trim()
  if (!raw || !token || !ns) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== "https:" || url.hostname !== RESEND_PREVIEW_REDIS_HOST ||
        url.username || url.password || url.port || url.pathname !== "/" ||
        url.search || url.hash) return null
    const redis = new Redis({ url: raw, token })
    return new PreviewResendDomainProofStore(redis, ns)
  } catch { return null }
}

export async function POST(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!auth.ok) return json(auth.code, auth.status)
  const env = process.env
  if (!pilotDispatchConfiguration(env).ready) return json("PILOT_DISPATCH_DISABLED", 503)

  // Parse only the id of a previously completed isolated audit. The caller
  // cannot choose a recipient, report, sender address, or message body.
  const raw = await request.text().catch(() => "")
  if (!raw || Buffer.byteLength(raw, "utf8") > 4_096) {
    return json("PILOT_DISPATCH_INPUT_INVALID", 400)
  }
  let requestId: unknown
  try {
    const body: unknown = JSON.parse(raw)
    requestId = body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).requestId : null
  } catch { return json("PILOT_DISPATCH_INPUT_INVALID", 400) }
  if (typeof requestId !== "string" || !/^[A-Za-z0-9_-]{8,200}$/.test(requestId)) {
    return json("PILOT_DISPATCH_INPUT_INVALID", 400)
  }

  let stores: ReturnType<typeof createIsolatedPilotStores>
  let proof: ReturnType<typeof previewDomainProofStore>
  try {
    stores = createIsolatedPilotStores(env, undefined, "dispatch")
    proof = previewDomainProofStore(env)
  } catch {
    return json("PILOT_DISPATCH_STORAGE_UNAVAILABLE", 503)
  }
  if (!stores || !proof) return json("PILOT_DISPATCH_STORAGE_UNAVAILABLE", 503)

  try {
    const sender = createResendAuditSender({
      env,
      readDomainProof: () => proof.readDomainProof(),
    })
    const result = await deliverQuickAuditOwnerPreview({
      requestId, env, sender,
      outbox: stores.outbox,
      proof: stores.paymentProof,
      reports: stores.reports,
    })
    // The provider's acceptance does NOT prove inbox delivery.
    return json("PILOT_DISPATCH_" + result.status.toUpperCase(),
      result.status === "submitted" ? 200 : 503)
  } catch {
    return json("PILOT_DISPATCH_BLOCKED", 503)
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, code: "PILOT_DISPATCH_POST_ONLY" }, {
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "no-store" },
  })
}
