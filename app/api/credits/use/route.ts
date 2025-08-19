import { stripe } from "@/lib/stripe"
import { callN8N } from "@/lib/n8n"
export const runtime = "nodejs"

async function hasActiveSub(email: string) {
  const customers = await stripe.customers.list({ email, limit: 1 })
  const c = customers.data[0]
  if (!c) return false
  const subs = await stripe.subscriptions.list({ customer: c.id, status: "all", limit: 10 })
  return subs.data.some((s) => ["active", "trialing", "past_due", "unpaid"].includes(s.status))
}

export async function POST(req: Request) {
  try {
    const { email, amount = 1, meta } = await req.json()
    if (!email) return Response.json({ ok: false, error: "email required" }, { status: 400 })

    const ok = await hasActiveSub(email)
    if (!ok) return Response.json({ ok: false, error: "subscription required" }, { status: 402 })

    // Delegate credit accounting to n8n/Postgres
    const result = await callN8N("credits.use", { email, amount, meta })
    // expected result: { remaining: number, used: number }
    return Response.json({ ok: true, ...result })
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message ?? String(e) }, { status: 502 })
  }
}
