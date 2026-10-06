import { NextRequest, NextResponse } from "next/server"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { completeGmailConnection, gmailSlots } from "@/lib/server/owner-gmail"
export const runtime = "nodejs"
export async function GET(request: NextRequest, context: { params: Promise<{ slot: string }> }) {
  const { slot } = await context.params
  if (!gmailSlots.includes(slot as typeof gmailSlots[number])) return NextResponse.json({ ok: false }, { status: 404 })
  let status = "connection-failed"
  const auth = await authorizeOwnerApiRequest(request)
  if (auth.ok && !request.nextUrl.searchParams.has("error")) {
    try {
      await completeGmailConnection(slot as typeof gmailSlots[number], auth.principal.subject, request.nextUrl.searchParams.get("state") ?? "", request.nextUrl.searchParams.get("code") ?? "", request.cookies.get(`ams_gmail_${slot}`)?.value)
      status = "connected"
    } catch { /* Never expose provider bodies, authorization codes or token errors. */ }
  }
  const url = new URL("/owner/scheduled-tasks", request.url); url.searchParams.set("gmail", status)
  const response = NextResponse.redirect(url)
  response.cookies.set(`ams_gmail_${slot}`, "", { httpOnly: true, secure: true, sameSite: "lax", path: `/api/owner/gmail/${slot}/callback`, maxAge: 0 })
  response.headers.set("Cache-Control", "no-store")
  return response
}
