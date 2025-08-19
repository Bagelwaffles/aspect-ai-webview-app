import { type NextRequest, NextResponse } from "next/server"
import { callN8N, n8nTarget } from "@/lib/n8n"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const target = n8nTarget()
  try {
    // Parse the request body
    const body = await request.json().catch(() => ({}))
    const action = body?.action ?? ""
    const data = body

    // Validate required fields
    if (!action || typeof action !== "string") {
      return NextResponse.json({ ok: false, error: "Missing 'action' string" }, { status: 400 })
    }

    console.log("[v0] n8n trigger request:", { action, data })

    // Make the call to n8n
    const result = await callN8N(action, data)

    console.log("[v0] n8n trigger response:", result)

    // Return the result
    if (result.success) {
      return NextResponse.json({ ok: true, result: result.data, target })
    } else {
      return NextResponse.json({ ok: false, error: result.error, target }, { status: 500 })
    }
  } catch (error) {
    console.error("[v0] n8n trigger error:", error)
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Internal server error",
        target,
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
