import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")

    console.log("[v0] Credits balance request for user:", userId)

    // In a real implementation, you would fetch from database
    const mockBalance = {
      userId: userId || "user_123",
      totalCredits: 2500,
      usedCredits: 1250,
      remainingCredits: 1250,
      lastUpdated: new Date().toISOString(),
    }

    return NextResponse.json({
      success: true,
      balance: mockBalance,
    })
  } catch (error) {
    console.error("[v0] Credits balance error:", error)
    return NextResponse.json({ success: false, error: "Failed to get balance" }, { status: 500 })
  }
}
