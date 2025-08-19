import { NextResponse } from "next/server"
import { callN8N } from "@/lib/n8n"

export async function GET() {
  try {
    const result = await callN8N({
      action: "get_shops",
      data: {},
    })

    if (result.success) {
      return NextResponse.json({
        success: true,
        shops: result.data?.shops || [],
      })
    } else {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }
  } catch (error) {
    console.error("[v0] Get shops error:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch shops" }, { status: 500 })
  }
}
