import { Redis } from "@upstash/redis"
import { NextRequest, NextResponse } from "next/server"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { PreviewResendDomainProofStore } from "@/lib/server/quick-audit-resend-domain-proof-store"
import { RESEND_PREVIEW_REDIS_HOST, RESEND_PREVIEW_BRANCH } from "@/lib/server/quick-audit-resend-preview-preflight"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!auth.ok) return NextResponse.json({ ok: false, code: auth.code }, { status: auth.status, headers: { "Cache-Control": "no-store" } })
  const env = process.env
  if (env.VERCEL_ENV !== "preview" || env.VERCEL_GIT_COMMIT_REF !== RESEND_PREVIEW_BRANCH) {
    return NextResponse.json({ ok: false, code: "RESEND_PROOF_PREVIEW_SCOPE_DENIED" }, { status: 403, headers: { "Cache-Control": "no-store" } })
  }
  const raw = env.AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL?.trim()
  const token = env.AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_TOKEN?.trim()
  const namespace = env.AMS_QUICK_AUDIT_RESEND_PROOF_NAMESPACE?.trim()
  if (!raw || !token || !namespace) return NextResponse.json({ ok: false, code: "RESEND_PROOF_STORE_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } })
  try {
    const url = new URL(raw)
    if (url.protocol !== "https:" || url.hostname !== RESEND_PREVIEW_REDIS_HOST || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) throw new Error("scope")
    const store = new PreviewResendDomainProofStore(new Redis({ url: raw, token }), namespace)
    const status = await store.inspectDomainProofStatus()
    return NextResponse.json({ ok: status.status === "current", ...status }, { status: 200, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } })
  } catch {
    return NextResponse.json({ ok: false, code: "RESEND_PROOF_READ_FAILED" }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
