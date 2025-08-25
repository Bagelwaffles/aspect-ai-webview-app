const required = [
  "NEXT_PUBLIC_APP_NAME",
  "NEXT_PUBLIC_APP_URL",
  "N8N_BASE_URL",
  "N8N_WEBHOOK_PATH",
  "N8N_WEBHOOK_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_ID",
  "STRIPE_WEBHOOK_SECRET",
  "PRINTIFY_API_KEY", // Added PRINTIFY_API_KEY to required env vars
  "RELEVANCE_API_KEY",
  "RELEVANCE_AUTH_TOKEN",
  "RELEVANCE_REGION",
  "RELEVANCE_PROJECT_ID",
  "RELEVANCE_AGENT_API_URL",
] as const

type Keys = (typeof required)[number]

function getEnv(name: Keys) {
  const v = process.env[name]
  if (!v || v.length === 0) throw new Error(`[env] Missing ${name}`)
  return v
}

export const env = Object.fromEntries(required.map((k) => [k, getEnv(k)])) as Record<Keys, string>
