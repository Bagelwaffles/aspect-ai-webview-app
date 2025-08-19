import { NextResponse } from "next/server"

export async function GET() {
  try {
    const healthData = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      uptime: process.uptime(),
      services: {
        database: await checkDatabaseHealth(),
        n8n: await checkN8nHealth(),
        stripe: await checkStripeHealth(),
        ai: await checkAIHealth(),
      },
      metrics: {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
      },
    }

    // Determine overall health status
    const serviceStatuses = Object.values(healthData.services)
    const hasUnhealthyService = serviceStatuses.some((service) => service.status !== "healthy")

    if (hasUnhealthyService) {
      healthData.status = "degraded"
    }

    const statusCode = healthData.status === "healthy" ? 200 : 503

    console.log("[v0] Health check completed:", healthData.status)

    return NextResponse.json(healthData, { status: statusCode })
  } catch (error) {
    console.error("[v0] Health check failed:", error)

    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: "Health check failed",
      },
      { status: 503 },
    )
  }
}

async function checkDatabaseHealth() {
  try {
    // In a real implementation, you would check database connectivity
    // For now, simulate a database check
    await new Promise((resolve) => setTimeout(resolve, 10))

    return {
      status: "healthy",
      responseTime: 10,
      lastChecked: new Date().toISOString(),
    }
  } catch (error) {
    return {
      status: "unhealthy",
      error: "Database connection failed",
      lastChecked: new Date().toISOString(),
    }
  }
}

async function checkN8nHealth() {
  try {
    if (!process.env.N8N_BASE_URL) {
      return {
        status: "not_configured",
        error: "N8N_BASE_URL not configured",
        lastChecked: new Date().toISOString(),
      }
    }

    const startTime = Date.now()
    const response = await fetch(`${process.env.N8N_BASE_URL}/webhook/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000), // 5 second timeout
    })

    const responseTime = Date.now() - startTime

    return {
      status: response.ok ? "healthy" : "unhealthy",
      responseTime,
      statusCode: response.status,
      lastChecked: new Date().toISOString(),
    }
  } catch (error) {
    return {
      status: "unhealthy",
      error: "N8N connection failed",
      lastChecked: new Date().toISOString(),
    }
  }
}

async function checkStripeHealth() {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return {
        status: "not_configured",
        error: "STRIPE_SECRET_KEY not configured",
        lastChecked: new Date().toISOString(),
      }
    }

    // In a real implementation, you would make a test API call to Stripe
    // For now, simulate a Stripe check
    await new Promise((resolve) => setTimeout(resolve, 50))

    return {
      status: "healthy",
      responseTime: 50,
      lastChecked: new Date().toISOString(),
    }
  } catch (error) {
    return {
      status: "unhealthy",
      error: "Stripe API check failed",
      lastChecked: new Date().toISOString(),
    }
  }
}

async function checkAIHealth() {
  try {
    const services = []

    // Check XAI/Grok
    if (process.env.XAI_API_KEY) {
      services.push({ name: "Grok", status: "healthy" })
    }

    // Check Relevance AI
    if (process.env.RELEVANCE_API_KEY) {
      services.push({ name: "Relevance AI", status: "healthy" })
    }

    return {
      status: services.length > 0 ? "healthy" : "not_configured",
      services,
      lastChecked: new Date().toISOString(),
    }
  } catch (error) {
    return {
      status: "unhealthy",
      error: "AI services check failed",
      lastChecked: new Date().toISOString(),
    }
  }
}
