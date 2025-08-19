function assertEnv(name: string, v?: string) {
  if (!v) throw new Error(`${name} is not set`)
  return v
}

/**
 * Calls your Relevance AI agent endpoint.
 */
export async function askRelevance({
  assistantId,
  message,
  metadata,
}: {
  assistantId: string
  message: string
  metadata?: Record<string, any>
}) {
  const url = assertEnv("RELEVANCE_AGENT_API_URL", process.env.RELEVANCE_AGENT_API_URL)
  const apiKey = assertEnv("RELEVANCE_API_KEY", process.env.RELEVANCE_API_KEY)

  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  }

  if (process.env.RELEVANCE_AUTH_TOKEN) headers["x-relevance-auth"] = process.env.RELEVANCE_AUTH_TOKEN!
  if (process.env.RELEVANCE_PROJECT_ID) headers["x-relevance-project"] = process.env.RELEVANCE_PROJECT_ID!
  if (process.env.RELEVANCE_REGION) headers["x-relevance-region"] = process.env.RELEVANCE_REGION!

  const body = JSON.stringify({
    assistantId,
    message,
    metadata,
    projectId: process.env.RELEVANCE_PROJECT_ID ?? undefined,
  })

  const res = await fetch(url, {
    method: "POST",
    headers,
    body,
    cache: "no-store",
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Relevance request failed: ${res.status} ${text}`)
  }

  try {
    return JSON.parse(text)
  } catch {
    return { text }
  }
}

export function relevanceTarget() {
  return process.env.RELEVANCE_AGENT_API_URL ?? null
}
