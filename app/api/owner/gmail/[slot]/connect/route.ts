import { NextRequest, NextResponse } from "next/server"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { beginGmailConnection, gmailSlots } from "@/lib/server/owner-gmail"
import { taskErrorCode } from "@/lib/server/scheduled-task-engine"
export const runtime = "nodejs"
export async function POST(request: NextRequest, context: { params: Promise<{ slot: string }> }) {
  const auth = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!auth.ok) return NextResponse.json({ ok: false, code: auth.code }, { status: auth.status })
  const { slot } = await context.params
  if (!gmailSlots.includes(slot as typeof gmailSlots[number])) return NextResponse.json({ ok: false }, { status: 404 })
  try {
    const attempt = await beginGmailConnection(slot as typeof gmailSlots[number], auth.principal.subject)
    const response = NextResponse.json({ ok: true, url: attempt.url }, { headers: { "Cache-Control": "no-store" } })
    response.cookies.set(`ams_gmail_${slot}`, attempt.state, { httpOnly: true, secure: true, sameSite: "lax", path: `/api/owner/gmail/${slot}/callback`, maxAge: 600 })
    return response
  } catch (error) { return NextResponse.json({ ok: false, code: taskErrorCode(error) }, { status: 503 }) }
}
