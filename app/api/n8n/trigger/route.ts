import { type NextRequest, NextResponse } from "next/server"
import { callN8N } from "@/lib/n8n"

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body = await request.json()
    const { action, data } = body

    // Validate required fields
    if (!action) {
      return NextResponse.json({ success: false, error: "Action is required" }, { status: 400 })
    }

    console.log("[v0] n8n trigger request:", { action, data })

    // Make the call to n8n
    const result = await callN8N({ action, data })

    console.log("[v0] n8n trigger response:", result)

    // Return the result
    if (result.success) {
      return NextResponse.json(result)
    } else {
      return NextResponse.json(result, { status: 500 })
    }
  } catch (error) {
    console.error("[v0] n8n trigger error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    )
  }
}

export async function GET() {
  // Health check endpoint
  return NextResponse.json({
    status: "ok",
    service: "n8n-proxy",
    timestamp: new Date().toISOString(),
  })
}
