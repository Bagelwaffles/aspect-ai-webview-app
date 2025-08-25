import { deploymentManager } from "@/lib/deployment"
import type { NextRequest } from "next/server"

export const runtime = "nodejs"

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const deployment = deploymentManager.getDeployment(params.id)

    if (!deployment) {
      return new Response("// Deployment not found", {
        status: 404,
        headers: { "Content-Type": "text/javascript" },
      })
    }

    const embedScript = deploymentManager.generateEmbedScript(deployment)

    return new Response(embedScript, {
      headers: {
        "Content-Type": "text/javascript",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    })
  } catch (error) {
    console.error("Failed to serve embed script:", error)
    return new Response("// Error loading chat widget", {
      status: 500,
      headers: { "Content-Type": "text/javascript" },
    })
  }
}
