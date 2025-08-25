import { relevanceClient } from "@/lib/relevance"
import type { NextRequest } from "next/server"

export const runtime = "nodejs"

export async function GET() {
  try {
    const workflows = await relevanceClient.getWorkflows()
    return Response.json({ workflows })
  } catch (error) {
    console.error("Relevance workflows API error:", error)
    return Response.json({ error: "Failed to fetch workflows" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const workflowData = await req.json()
    const workflow = await relevanceClient.createWorkflow(workflowData)
    return Response.json({ workflow }, { status: 201 })
  } catch (error) {
    console.error("Failed to create workflow:", error)
    return Response.json({ error: "Failed to create workflow" }, { status: 500 })
  }
}
