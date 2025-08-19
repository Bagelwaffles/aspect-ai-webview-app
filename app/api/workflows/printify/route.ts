import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, userId, ...data } = body

    console.log("[v0] Printify workflow request:", { action, userId })

    // Deduct credits for workflow execution
    const creditsResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/credits/use`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: userId || "user_123",
        amount: getCreditsForAction(action),
        reason: `Printify ${action}`,
        workflowId: `printify_${action}`,
      }),
    })

    const creditsResult = await creditsResponse.json()
    if (!creditsResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient credits",
          creditsRequired: getCreditsForAction(action),
        },
        { status: 402 },
      )
    }

    // Forward to n8n Printify workflow
    const n8nResponse = await fetch(`${process.env.N8N_BASE_URL}${process.env.N8N_WEBHOOK_PATH}/printify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vo-secret": process.env.N8N_WEBHOOK_SECRET || "",
      },
      body: JSON.stringify({ action, ...data }),
    })

    if (!n8nResponse.ok) {
      throw new Error(`n8n workflow failed: ${n8nResponse.status}`)
    }

    const result = await n8nResponse.json()
    console.log("[v0] Printify workflow completed:", action)

    return NextResponse.json({
      success: true,
      data: result,
      creditsUsed: getCreditsForAction(action),
      remainingCredits: creditsResult.newBalance,
    })
  } catch (error) {
    console.error("[v0] Printify workflow error:", error)
    return NextResponse.json({ success: false, error: "Workflow execution failed" }, { status: 500 })
  }
}

function getCreditsForAction(action: string): number {
  const creditCosts = {
    shops: 2,
    uploads: 5,
    "products.create": 10,
    "products.publish": 15,
  }
  return creditCosts[action as keyof typeof creditCosts] || 5
}
