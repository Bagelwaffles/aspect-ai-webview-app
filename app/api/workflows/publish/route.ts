import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { shop_id, product_id, userId, ...publishData } = body

    console.log("[v0] Listing publish request:", { shop_id, product_id, userId })

    // Deduct credits for publishing
    const creditsResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/credits/use`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: userId || "user_123",
        amount: 20, // 20 credits for publishing
        reason: "Etsy Listing Publish",
        workflowId: `publish_${product_id}`,
      }),
    })

    const creditsResult = await creditsResponse.json()
    if (!creditsResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient credits",
          creditsRequired: 20,
        },
        { status: 402 },
      )
    }

    // Forward to n8n listing publish workflow
    const n8nResponse = await fetch(`${process.env.N8N_BASE_URL}${process.env.N8N_WEBHOOK_PATH}/listing-publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vo-secret": process.env.N8N_WEBHOOK_SECRET || "",
      },
      body: JSON.stringify({
        shop_id,
        product_id,
        body: publishData,
      }),
    })

    if (!n8nResponse.ok) {
      throw new Error(`n8n publish workflow failed: ${n8nResponse.status}`)
    }

    const result = await n8nResponse.json()
    console.log("[v0] Listing published successfully:", product_id)

    return NextResponse.json({
      success: true,
      data: result,
      creditsUsed: 20,
      remainingCredits: creditsResult.newBalance,
    })
  } catch (error) {
    console.error("[v0] Listing publish error:", error)
    return NextResponse.json({ success: false, error: "Publishing failed" }, { status: 500 })
  }
}
