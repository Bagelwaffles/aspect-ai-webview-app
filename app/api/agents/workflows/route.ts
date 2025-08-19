import { type NextRequest, NextResponse } from "next/server"
import { callN8N } from "@/lib/n8n"

export async function GET() {
  try {
    console.log("[v0] Fetching workflows from n8n")

    const result = await callN8N("printify.shops.list")

    if (result.success) {
      return NextResponse.json({
        success: true,
        workflows: result.data?.shops || result.data || [],
        message: "Workflows fetched successfully",
      })
    } else {
      console.log("[v0] Failed to fetch workflows:", result.error)
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          workflows: [],
        },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error("[v0] List workflows error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch workflows",
        workflows: [],
      },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, data } = body

    if (!action) {
      return NextResponse.json(
        {
          success: false,
          error: "action is required",
        },
        { status: 400 },
      )
    }

    console.log(`[v0] Triggering n8n workflow action: ${action}`)

    const result = await callN8N(action, data || {})

    if (result.success) {
      console.log(`[v0] Workflow ${action} triggered successfully`)
      return NextResponse.json({
        success: true,
        data: result.data,
        message: `Workflow ${action} executed successfully`,
      })
    } else {
      console.log(`[v0] Workflow ${action} failed:`, result.error)
      return NextResponse.json(result, { status: 500 })
    }
  } catch (error) {
    console.error("[v0] Trigger workflow error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to trigger workflow",
      },
      { status: 500 },
    )
  }
}
