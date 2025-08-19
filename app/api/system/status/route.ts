import { NextResponse } from "next/server"

export async function GET() {
  try {
    // Get system metrics and status
    const systemStatus = {
      timestamp: new Date().toISOString(),
      application: {
        name: "Aspect Marketing Solutions",
        version: "1.0.0",
        environment: process.env.NODE_ENV || "development",
        uptime: process.uptime(),
      },
      performance: {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
      },
      integrations: {
        stripe: !!process.env.STRIPE_SECRET_KEY,
        n8n: !!process.env.N8N_BASE_URL,
        xai: !!process.env.XAI_API_KEY,
        relevance: !!process.env.RELEVANCE_API_KEY,
      },
      metrics: {
        totalUsers: 1250, // Mock data
        activeWorkflows: 12,
        creditsProcessed: 45600,
        apiCalls: 8900,
      },
    }

    return NextResponse.json(systemStatus)
  } catch (error) {
    console.error("[v0] System status error:", error)
    return NextResponse.json({ error: "Failed to get system status" }, { status: 500 })
  }
}
