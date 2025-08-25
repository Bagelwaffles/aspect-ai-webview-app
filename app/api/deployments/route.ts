import { deploymentManager } from "@/lib/deployment"
import type { NextRequest } from "next/server"

export const runtime = "nodejs"

export async function GET() {
  try {
    const deployments = deploymentManager.getAllDeployments()
    return Response.json({ deployments })
  } catch (error) {
    console.error("Failed to fetch deployments:", error)
    return Response.json({ error: "Failed to fetch deployments" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { agentId, agentName, agentType, name, config } = await req.json()

    if (!agentId || !agentName || !agentType || !name) {
      return Response.json({ error: "Missing required fields" }, { status: 400 })
    }

    const deployment = deploymentManager.createDeployment(agentId, agentName, agentType, name, config)

    return Response.json({ deployment }, { status: 201 })
  } catch (error) {
    console.error("Failed to create deployment:", error)
    return Response.json({ error: "Failed to create deployment" }, { status: 500 })
  }
}
