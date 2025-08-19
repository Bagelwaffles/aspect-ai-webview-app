import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")
    const limit = Number.parseInt(searchParams.get("limit") || "50")

    console.log("[v0] Credits history request:", { userId, limit })

    // Mock transaction history
    const mockTransactions = [
      {
        id: "txn_001",
        type: "credit",
        amount: 2500,
        reason: "Pro Plan Purchase",
        timestamp: "2024-11-15T10:00:00Z",
        balance: 2500,
      },
      {
        id: "txn_002",
        type: "debit",
        amount: 5,
        reason: "AI Assistant Query",
        timestamp: "2024-11-15T14:30:00Z",
        balance: 2495,
      },
      {
        id: "txn_003",
        type: "debit",
        amount: 10,
        reason: "Printify Product Creation",
        timestamp: "2024-11-15T15:45:00Z",
        balance: 2485,
      },
      {
        id: "txn_004",
        type: "debit",
        amount: 3,
        reason: "Workflow Automation",
        timestamp: "2024-11-16T09:15:00Z",
        balance: 2482,
      },
      {
        id: "txn_005",
        type: "debit",
        amount: 8,
        reason: "Etsy Listing Publish",
        timestamp: "2024-11-16T11:20:00Z",
        balance: 2474,
      },
    ]

    return NextResponse.json({
      success: true,
      transactions: mockTransactions.slice(0, limit),
      total: mockTransactions.length,
    })
  } catch (error) {
    console.error("[v0] Credits history error:", error)
    return NextResponse.json({ success: false, error: "Failed to get history" }, { status: 500 })
  }
}
