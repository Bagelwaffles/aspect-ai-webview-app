import { createHmac } from "node:crypto"
import { z } from "zod"
import { NextRequest, NextResponse } from "next/server"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { ownerGmailContext } from "@/lib/server/owner-gmail"
import { taskErrorCode } from "@/lib/server/scheduled-task-engine"
export const runtime = "nodejs"
export const maxDuration = 60
export async function POST(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!auth.ok) return NextResponse.json({ ok: false }, { status: auth.status })
  const input = z.object({ requestId: z.string().uuid() }).strict().safeParse(await request.json().catch(() => null))
  if (!input.success) return NextResponse.json({ ok: false }, { status: 400 })
  try {
    const c = ownerGmailContext(), raw = process.env.AMS_MONITOR_ALERT_WEBHOOK_URL, secret = process.env.AMS_MONITOR_ALERT_WEBHOOK_SECRET
    if (!raw || !secret) throw new Error("GMAIL_WEBHOOK_REQUIRED")
    const url = new URL(raw)
    // Owner test must use our reviewed same-origin receiver, never arbitrary targets.
    if (url.href !== `${new URL(process.env.PUBLIC_APP_URL || process.env.NEXTAUTH_URL!).origin}/api/internal/monitoring/email`) throw new Error("GMAIL_WEBHOOK_REQUIRED")
    const id = input.data.requestId
    const previous = await c.redis.get<string>(`${c.prefix}test:${id}`)
    const at = previous ? z.object({ at: z.string().datetime() }).parse(typeof previous === "string" ? JSON.parse(previous) : previous).at : new Date().toISOString()
    const body = JSON.stringify({ source: "ams-scheduled-tasks", id, task: "Owner notification test", severity: "actionable", createdAt: at, summary: "Owner-authorized notification delivery test", details: null })
    await c.redis.set(`${c.prefix}test:${id}`, JSON.stringify({ id, at, status: "attempted" }), { ex: 30 * 86400 })
    try {
      const response = await fetch(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(25_000), headers: { "Content-Type": "application/json", "Idempotency-Key": id, "X-AMS-Monitor-Signature": createHmac("sha256", secret).update(body).digest("hex") }, body })
      const receipt = await response.json()
      const delivered = response.ok && receipt.delivered === true && /^gmail:[A-Za-z0-9_-]+$/u.test(receipt.deliveryId ?? "")
      await c.redis.set(`${c.prefix}test:${id}`, JSON.stringify({ id, at, status: delivered ? "delivered" : "unconfirmed", deliveryId: delivered ? receipt.deliveryId : null }), { ex: 30 * 86400 })
      return NextResponse.json({ ok: delivered, id, status: delivered ? "delivered" : "unconfirmed" }, { headers: { "Cache-Control": "no-store" } })
    } catch {
      await c.redis.set(`${c.prefix}test:${id}`, JSON.stringify({ id, at, status: "unconfirmed" }), { ex: 30 * 86400 })
      throw new Error("GMAIL_TEST_UNCONFIRMED")
    }
  } catch (error) { return NextResponse.json({ ok: false, code: taskErrorCode(error) }, { status: 503 }) }
}
