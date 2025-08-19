import crypto from "crypto"

function assertEnv(name: string, v?: string) {
  if (!v) throw new Error(`${name} is not set`)
  return v
}

export async function callN8N(action: string, payload: unknown = {}) {
  const base = assertEnv("N8N_BASE_URL", process.env.N8N_BASE_URL)
  const path = assertEnv("N8N_WEBHOOK_PATH", process.env.N8N_WEBHOOK_PATH)
  const secret = assertEnv("N8N_WEBHOOK_SECRET", process.env.N8N_WEBHOOK_SECRET)

  if (!/^https?:\/\//i.test(base)) {
    throw new Error("N8N_BASE_URL must be absolute (https://...)")
  }

  const body = JSON.stringify({ action, ...payload })
  const ts = Math.floor(Date.now() / 1000).toString()
  const sig = crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex")

  const target = `${base}${path}`

  const res = await fetch(target, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "x-vo-secret": secret,
      "x-vo-timestamp": ts,
      "x-vo-signature": sig,
    },
    body,
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`n8n ${action} failed: ${res.status} ${text}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

export function n8nTarget() {
  const base = process.env.N8N_BASE_URL
  const path = process.env.N8N_WEBHOOK_PATH
  return base && path ? `${base}${path}` : null
}

export async function triggerWorkflow(action: string, data?: Record<string, any>) {
  return callN8N(action, data)
}

export async function getWorkflowStatus(workflowId: string) {
  return callN8N("status", { workflowId })
}

export async function listWorkflows() {
  return callN8N("workflows.list")
}

export async function checkN8nConnection(): Promise<boolean> {
  const base = process.env.N8N_BASE_URL
  const path = process.env.N8N_WEBHOOK_PATH
  const secret = process.env.N8N_WEBHOOK_SECRET

  return !!(base && path && secret)
}
