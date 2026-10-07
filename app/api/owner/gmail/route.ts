import { NextRequest, NextResponse } from "next/server"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { gmailConnectionStatus, gmailSlots } from "@/lib/server/owner-gmail"
export const runtime = "nodejs"
export async function GET(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request)
  if (!auth.ok) return NextResponse.json({ ok: false }, { status: auth.status })
  const accounts = await Promise.all(gmailSlots.map(async slot => {
    try { return await gmailConnectionStatus(slot) } catch { return { slot, connected: false, status: "configuration-required" } }
  }))
  return NextResponse.json({ ok: true, accounts, autoReply: { armed: process.env.AMS_GMAIL_AUTOREPLY_ENABLED === "true" && process.env.AMS_GMAIL_SEND_ENABLED === "true", mode: "first-contact-acknowledgements-only", liveSendingVerified: false } }, { headers: { "Cache-Control": "no-store" } })
}
