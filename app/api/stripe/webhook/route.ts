import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const eventType = body.type

    console.log("[v0] Stripe webhook received:", eventType)

    // Forward to n8n stripe-relay webhook
    const n8nResponse = await fetch(`${process.env.N8N_BASE_URL}${process.env.N8N_WEBHOOK_PATH}/stripe-relay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vo-secret": process.env.N8N_WEBHOOK_SECRET || "",
      },
      body: JSON.stringify(body),
    })

    if (!n8nResponse.ok) {
      throw new Error(`n8n webhook failed: ${n8nResponse.status}`)
    }

    const result = await n8nResponse.json()
    console.log("[v0] n8n webhook response:", result)

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("[v0] Stripe webhook error:", error)
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 400 })
  }
}
