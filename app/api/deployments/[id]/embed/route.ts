import { deploymentManager } from "@/lib/deployment"
import type { NextRequest } from "next/server"

export const runtime = "nodejs"

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const deployment = deploymentManager.getDeployment(params.id)

    if (!deployment) {
      return Response.json({ error: "Deployment not found" }, { status: 404 })
    }

    const embedScript = deploymentManager.generateEmbedScript(deployment)

    return new Response(embedScript, {
      headers: {
        "Content-Type": "text/javascript",
        "Cache-Control": "public, max-age=3600",
      },
    })
  } catch (error) {
    console.error("Failed to generate embed script:", error)
    return new Response("// Error generating embed script", {
      status: 500,
      headers: { "Content-Type": "text/javascript" },
    })
  }
}
