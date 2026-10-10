import { NextRequest, NextResponse } from "next/server"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { gmailConnectionStatus, gmailSlots, ownerGmailContext } from "@/lib/server/owner-gmail"
import { readOwnerAlertReceiptProof } from "@/lib/server/owner-gmail-send-evidence"

export const runtime = "nodejs"
export async function GET(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request)
  if (!auth.ok) return NextResponse.json({ ok: false }, { status: auth.status })
  const accounts = await Promise.all(gmailSlots.map(async slot => {
    try { return await gmailConnectionStatus(slot) } catch { return { slot, connected: false, status: "configuration-required" } }
  }))
  const primary = accounts.find(account => account.slot === "primary")
  let ownerAlertReceiptVerifiedAt: string | null = null
  const primaryConnectedAt = primary && "connectedAt" in primary && typeof primary.connectedAt === "string" ? primary.connectedAt : null
  if (primary?.connected && primaryConnectedAt) {
    try {
      const c = ownerGmailContext()
      ownerAlertReceiptVerifiedAt = await readOwnerAlertReceiptProof(c.redis, c.prefix, primaryConnectedAt)
    } catch {
      // A failed evidence read must never be interpreted as successful sending.
    }
  }
  return NextResponse.json({
    ok: true, accounts, refreshVerificationAvailable: process.env.VERCEL_ENV === "preview",
    autoReply: {
      armed: process.env.AMS_GMAIL_AUTOREPLY_ENABLED === "true" && process.env.AMS_GMAIL_SEND_ENABLED === "true",
      mode: "first-contact-acknowledgements-only",
      ownerAlertReceiptVerified: ownerAlertReceiptVerifiedAt !== null,
      ownerAlertReceiptVerifiedAt,
      firstContactAcknowledgementVerified: false,
    },
  }, { headers: { "Cache-Control": "no-store" } })
}
