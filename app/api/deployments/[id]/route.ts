import { deploymentManager } from "@/lib/deployment"
import type { NextRequest } from "next/server"

export const runtime = "nodejs"

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const deployment = deploymentManager.getDeployment(params.id)

    if (!deployment) {
      return Response.json({ error: "Deployment not found" }, { status: 404 })
    }

    return Response.json({ deployment })
  } catch (error) {
    console.error("Failed to fetch deployment:", error)
    return Response.json({ error: "Failed to fetch deployment" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const updates = await req.json()
    const deployment = deploymentManager.updateDeployment(params.id, updates)

    if (!deployment) {
      return Response.json({ error: "Deployment not found" }, { status: 404 })
    }

    return Response.json({ deployment })
  } catch (error) {
    console.error("Failed to update deployment:", error)
    return Response.json({ error: "Failed to update deployment" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const success = deploymentManager.deleteDeployment(params.id)

    if (!success) {
      return Response.json({ error: "Deployment not found" }, { status: 404 })
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error("Failed to delete deployment:", error)
    return Response.json({ error: "Failed to delete deployment" }, { status: 500 })
  }
}
