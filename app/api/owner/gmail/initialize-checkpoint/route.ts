import { z } from "zod"
import { NextRequest, NextResponse } from "next/server"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { initializeOwnerGmailCheckpoint } from "@/lib/server/owner-gmail-checkpoint-initialization"
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
  try { return reply({ ok: true, evidence: await initializeOwnerGmailCheckpoint(input.data.slot, input.data.requestId) }) }
  catch (error) {
    const code = error instanceof Error && /^GMAIL_INITIALIZATION_[A-Z_]+$/u.test(error.message) ? error.message : "GMAIL_INITIALIZATION_UNAVAILABLE"
    return reply({ ok: false, code }, code === "GMAIL_INITIALIZATION_BUSY" ? 409 : 503)
  }
}
