/** Signed-in owner only. Fail-closed; creates TEST checkout only, never charges. */
import { createOwnerPilotTestCheckoutHandler } from "@/lib/server/quick-audit-owner-pilot-checkout"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const POST = createOwnerPilotTestCheckoutHandler()
export async function GET() {
  return Response.json({ ok: false, code: "PILOT_TEST_CHECKOUT_POST_ONLY" }, {
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "no-store" },
  })
}
