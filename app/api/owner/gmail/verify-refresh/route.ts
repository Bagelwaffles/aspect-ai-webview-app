import { z } from "zod"
import { NextRequest, NextResponse } from "next/server"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { ownerGmailContext } from "@/lib/server/owner-gmail"
import { refreshVerificationSchema, verifyOwnerGmailRefresh } from "@/lib/server/owner-gmail-refresh-verification"
export const runtime = "nodejs"
export const maxDuration = 60
const inputSchema = z.object({ slot: z.enum(["primary", "secondary"]), requestId: z.string().uuid() }).strict()
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
export async function POST(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return reply({ ok: false }, 404)
  const auth = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!auth.ok) return reply({ ok: false, code: auth.code }, auth.status)
  const input = inputSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return reply({ ok: false }, 400)
  try {
    const evidence = await verifyOwnerGmailRefresh(input.data.slot, input.data.requestId)
    return reply({ ok: evidence.status === "passed", evidence })
  } catch (error) {
    const code = error instanceof Error && ["GMAIL_VERIFICATION_BUSY", "GMAIL_VERIFICATION_REPLIES_MUST_BE_OFF"].includes(error.message) ? error.message : "GMAIL_VERIFICATION_UNAVAILABLE"
    return reply({ ok: false, code }, code === "GMAIL_VERIFICATION_BUSY" ? 409 : 503)
  }
}
export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return reply({ ok: false }, 404)
  const auth = await authorizeOwnerApiRequest(request)
  if (!auth.ok) return reply({ ok: false, code: auth.code }, auth.status)
  const input = inputSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!input.success) return reply({ ok: false }, 400)
  try {
    const c = ownerGmailContext()
    const raw = await c.redis.get<string>(`${c.prefix}refresh-verification:${input.data.slot}:${input.data.requestId}`)
    if (!raw) return reply({ ok: false }, 404)
    const evidence = refreshVerificationSchema.parse(typeof raw === "string" ? JSON.parse(raw) : raw)
    return reply({ ok: evidence.status === "passed", evidence })
  } catch { return reply({ ok: false, code: "GMAIL_VERIFICATION_UNAVAILABLE" }, 503) }
}
