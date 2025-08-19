import crypto from "crypto"

interface N8nResponse {
  success: boolean
  data?: any
  error?: string
}

interface N8nCallOptions {
  action: string
  data?: Record<string, any>
  headers?: Record<string, string>
}

/**
 * Make a secure call to n8n workflow via webhook with HMAC authentication
 */
export async function callN8N(action: string, payload: unknown = {}): Promise<N8nResponse> {
  try {
    // Validate required environment variables
    const base = process.env.N8N_BASE_URL
    const path = process.env.N8N_WEBHOOK_PATH
    const secret = process.env.N8N_WEBHOOK_SECRET

    if (!base || !path || !secret) {
      return {
        success: false,
        error:
          "n8n configuration missing. Please set N8N_BASE_URL, N8N_WEBHOOK_PATH, and N8N_WEBHOOK_SECRET environment variables.",
      }
    }

    // Prepare request body and HMAC signature
    const body = JSON.stringify({ action, ...payload })
    const ts = Math.floor(Date.now() / 1000).toString()
    const sig = crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex")

    // Make secure request with HMAC authentication
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "x-vo-secret": secret, // simple header auth
        "x-vo-timestamp": ts, // replay guard
        "x-vo-signature": sig, // HMAC check
      },
      body,
    })

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error")
      return {
        success: false,
        error: `n8n ${action} failed: ${res.status} ${errorText}`,
      }
    }

    const result = await res.json().catch(() => ({}))
    return {
      success: true,
      data: result,
    }
  } catch (error) {
    console.error("[n8n] Call failed:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }
  }
}

/**
 * Trigger a specific n8n workflow action
 */
export async function triggerWorkflow(action: string, data?: Record<string, any>) {
  return callN8N(action, data)
}

/**
 * Get workflow status
 */
export async function getWorkflowStatus(workflowId: string) {
  return callN8N("status", { workflowId })
}

/**
 * List available workflows
 */
export async function listWorkflows() {
  return callN8N("printify.shops.list")
}

/**
 * Check n8n connection status
 */
export async function checkN8nConnection(): Promise<boolean> {
  const base = process.env.N8N_BASE_URL
  const path = process.env.N8N_WEBHOOK_PATH
  const secret = process.env.N8N_WEBHOOK_SECRET

  return !!(base && path && secret)
}
