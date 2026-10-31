/** Disabled by default: signed Stripe-origin receipt → owner-only Preview pull. */
import { createOwnerSignedReceiptHandoff } from "@/lib/server/quick-audit-owner-signed-receipt-handoff"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const POST = createOwnerSignedReceiptHandoff()

export function GET() {
  return Response.json({ ok: false, code: "POST_ONLY" }, {
    status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" },
  })
}
