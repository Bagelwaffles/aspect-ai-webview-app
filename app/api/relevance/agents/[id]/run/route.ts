import { relevanceClient } from "@/lib/relevance"
import type { NextRequest } from "next/server"

export const runtime = "nodejs"

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { input } = await req.json()
    const result = await relevanceClient.runAgent(params.id, input)
    return Response.json({ result })
  } catch (error) {
    console.error("Failed to run Relevance agent:", error)
    return Response.json({ error: "Failed to run agent" }, { status: 500 })
  }
}
