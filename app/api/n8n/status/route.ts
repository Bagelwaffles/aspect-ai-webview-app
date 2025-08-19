import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    console.log("[v0] Checking n8n connection status")

    const n8nBaseUrl = process.env.N8N_BASE_URL
    const n8nWebhookPath = process.env.N8N_WEBHOOK_PATH
    const n8nWebhookSecret = process.env.N8N_WEBHOOK_SECRET

    if (!n8nBaseUrl || !n8nWebhookPath || !n8nWebhookSecret) {
      console.log(
        "[v0] n8n not connected: n8n environment variables not configured. Please set N8N_BASE_URL, N8N_WEBHOOK_PATH, and N8N_WEBHOOK_SECRET.",
      )
      return NextResponse.json({
        connected: false,
        message:
          "n8n environment variables not configured. Please set N8N_BASE_URL, N8N_WEBHOOK_PATH, and N8N_WEBHOOK_SECRET.",
        missing: {
          N8N_BASE_URL: !n8nBaseUrl,
          N8N_WEBHOOK_PATH: !n8nWebhookPath,
          N8N_WEBHOOK_SECRET: !n8nWebhookSecret,
        },
      })
    }

    try {
      const response = await fetch(`${n8nBaseUrl}${n8nWebhookPath}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-vo-secret": n8nWebhookSecret,
        },
        body: JSON.stringify({ action: "health_check" }),
        signal: AbortSignal.timeout(5000), // 5 second timeout
      })

      if (response.ok || response.status === 400) {
        // 400 is acceptable - means webhook is responding but may not handle health_check action
        console.log("[v0] n8n connected successfully")
        return NextResponse.json({
          connected: true,
          message: "n8n is connected and responding",
          url: `${n8nBaseUrl}${n8nWebhookPath}`,
        })
      } else {
        console.log(`[v0] n8n connection failed with status ${response.status}`)
        return NextResponse.json({
          connected: false,
          message: `n8n responded with status ${response.status}`,
        })
      }
    } catch (fetchError) {
      console.log(
        `[v0] Cannot reach n8n at ${n8nBaseUrl}${n8nWebhookPath}: ${fetchError instanceof Error ? fetchError.message : "Unknown error"}`,
      )
      return NextResponse.json({
        connected: false,
        message: `Cannot reach n8n at ${n8nBaseUrl}${n8nWebhookPath}: ${fetchError instanceof Error ? fetchError.message : "Unknown error"}`,
      })
    }
  } catch (error) {
    console.error("[v0] Error checking n8n status:", error)
    return NextResponse.json(
      {
        connected: false,
        message: "Error checking n8n connection",
      },
      { status: 500 },
    )
  }
}
