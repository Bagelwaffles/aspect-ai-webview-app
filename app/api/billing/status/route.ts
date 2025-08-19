import { stripe } from "@/lib/stripe"
export const runtime = "nodejs"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const email = searchParams.get("email") ?? ""
  if (!email) return Response.json({ ok: false, error: "email required" }, { status: 400 })

  try {
    const customers = await stripe.customers.list({ email, limit: 1 })
    const customer = customers.data[0]
    if (!customer) return Response.json({ ok: true, subscribed: false })

    const subs = await stripe.subscriptions.list({
      customer: customer.id,
      status: "all",
      limit: 10,
      expand: ["data.default_payment_method", "data.items.data.price.product"],
    })

    const active = subs.data.find((s) => ["active", "trialing", "past_due", "unpaid"].includes(s.status))

    if (!active) return Response.json({ ok: true, subscribed: false, customerId: customer.id })

    return Response.json({
      ok: true,
      subscribed: true,
      customerId: customer.id,
      subscriptionId: active.id,
      status: active.status,
      currentPeriodEnd: active.current_period_end ? active.current_period_end * 1000 : null,
      priceId: active.items.data[0]?.price?.id ?? null,
      productName: (active.items.data[0]?.price?.product as any)?.name ?? active.items.data[0]?.price?.nickname ?? null,
    })
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message ?? String(e) }, { status: 502 })
  }
}
