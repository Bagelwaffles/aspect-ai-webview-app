import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

const REQUIRED_KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "PUBLIC_APP_URL",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "AMS_INTERNAL_API_KEY",
  "INTERNAL_ADMIN_EMAIL",
  "INTERNAL_ADMIN_PASSWORD_HASH",
  "INTERNAL_ADMIN_SECRET",
  "AMS_STAGING_REDIS_REST_TOKEN",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "AMS_STRIPE_WEBHOOK_MODE",
  "AMS_STRIPE_STARTER_PRICE_ID",
  "AMS_STRIPE_GROWTH_PRICE_ID",
  "AMS_STRIPE_PRO_PRICE_ID",
  "NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE",
] as const

const PUBLIC_URL_KEYS = ["NEXT_PUBLIC_APP_URL", "PUBLIC_APP_URL", "NEXTAUTH_URL"] as const
const SECRET_KEYS = [
  "NEXTAUTH_SECRET",
  "AMS_INTERNAL_API_KEY",
  "INTERNAL_ADMIN_SECRET",
  "AMS_STAGING_REDIS_REST_TOKEN",
] as const
const PRICE_KEYS = [
  "AMS_STRIPE_STARTER_PRICE_ID",
  "AMS_STRIPE_GROWTH_PRICE_ID",
  "AMS_STRIPE_PRO_PRICE_ID",
] as const

export type StagingEnvironment = Record<string, string>

export function parseEnvText(text: string): StagingEnvironment {
  const parsed: StagingEnvironment = {}
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const separator = line.indexOf("=")
    if (separator < 1) continue
    const key = line.slice(0, separator).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) continue
    if (Object.hasOwn(parsed, key)) {
      throw new Error(`Duplicate staging environment key: ${key}`)
    }
    let value = line.slice(separator + 1).trim()
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1)
    }
    parsed[key] = value
  }
  return parsed
}

function isPlaceholder(value: string): boolean {
  return /(?:replace|change[-_ ]?me|placeholder|your[-_])/iu.test(value)
}

function addError(errors: string[], key: string, message: string) {
  errors.push(`${key}: ${message}`)
}

export function validateStagingConfig(env: StagingEnvironment): string[] {
  const errors: string[] = []

  for (const key of REQUIRED_KEYS) {
    const value = env[key]?.trim() ?? ""
    if (!value) addError(errors, key, "is required")
    else if (isPlaceholder(value)) addError(errors, key, "still contains a placeholder")
  }

  const origins = new Set<string>()
  for (const key of PUBLIC_URL_KEYS) {
    const value = env[key]?.trim()
    if (!value || isPlaceholder(value)) continue
    try {
      const url = new URL(value)
      const hostname = url.hostname.toLowerCase()
      if (url.protocol !== "https:") addError(errors, key, "must use HTTPS")
      if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "host.docker.internal" ||
        hostname.endsWith(".localhost") ||
        hostname.endsWith(".invalid") ||
        hostname.endsWith(".example")
      ) {
        addError(errors, key, "must use a real non-loopback staging host")
      }
      if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
        addError(errors, key, "must contain only the staging origin")
      }
      origins.add(url.origin)
    } catch {
      addError(errors, key, "must be a valid absolute URL")
    }
  }
  if (origins.size > 1) {
    errors.push("PUBLIC_URLS: NEXT_PUBLIC_APP_URL, PUBLIC_APP_URL, and NEXTAUTH_URL must match")
  }

  for (const key of SECRET_KEYS) {
    const value = env[key]?.trim() ?? ""
    if (value && !isPlaceholder(value) && value.length < 32) {
      addError(errors, key, "must be at least 32 characters")
    }
  }

  const googleClientId = env.GOOGLE_CLIENT_ID?.trim() ?? ""
  if (
    googleClientId &&
    !isPlaceholder(googleClientId) &&
    !googleClientId.endsWith(".apps.googleusercontent.com")
  ) {
    addError(errors, "GOOGLE_CLIENT_ID", "does not look like a Google OAuth web client ID")
  }

  const adminEmail = env.INTERNAL_ADMIN_EMAIL?.trim() ?? ""
  if (adminEmail && !isPlaceholder(adminEmail) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(adminEmail)) {
    addError(errors, "INTERNAL_ADMIN_EMAIL", "must be an email address")
  }

  const adminPasswordHash = env.INTERNAL_ADMIN_PASSWORD_HASH?.trim() ?? ""
  if (
    adminPasswordHash &&
    !isPlaceholder(adminPasswordHash) &&
    !/^scrypt-v1\$[A-Za-z0-9_-]{22,86}\$[A-Za-z0-9_-]{43}$/u.test(adminPasswordHash)
  ) {
    addError(errors, "INTERNAL_ADMIN_PASSWORD_HASH", "must be a supported scrypt-v1 hash")
  }

  if (env.AMS_STRIPE_WEBHOOK_MODE?.trim() !== "test") {
    addError(errors, "AMS_STRIPE_WEBHOOK_MODE", "must equal test")
  }
  const stripeSecret = env.STRIPE_SECRET_KEY?.trim() ?? ""
  if (stripeSecret.startsWith("sk_live_")) {
    addError(errors, "STRIPE_SECRET_KEY", "live keys are forbidden in staging")
  } else if (stripeSecret && !isPlaceholder(stripeSecret) && !stripeSecret.startsWith("sk_test_")) {
    addError(errors, "STRIPE_SECRET_KEY", "must be a Stripe test secret key")
  }
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim() ?? ""
  if (webhookSecret && !isPlaceholder(webhookSecret) && !webhookSecret.startsWith("whsec_")) {
    addError(errors, "STRIPE_WEBHOOK_SECRET", "must be a Stripe webhook signing secret")
  }

  const priceIds: string[] = []
  for (const key of PRICE_KEYS) {
    const value = env[key]?.trim() ?? ""
    if (value && !isPlaceholder(value)) {
      if (!value.startsWith("price_")) addError(errors, key, "must be a Stripe price ID")
      priceIds.push(value)
    }
  }
  if (priceIds.length === PRICE_KEYS.length && new Set(priceIds).size !== PRICE_KEYS.length) {
    errors.push("STRIPE_PRICE_IDS: starter, growth, and pro must use distinct recurring prices")
  }

  const launchValue = env.NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE?.trim().toLowerCase() ?? ""
  if (launchValue && launchValue !== "true" && launchValue !== "false") {
    addError(errors, "NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE", "must equal true or false")
  }

  const gatewayApiKey = env.AI_GATEWAY_API_KEY?.trim() ?? ""
  const oidcToken = env.VERCEL_OIDC_TOKEN?.trim() ?? ""
  if (gatewayApiKey && isPlaceholder(gatewayApiKey)) {
    addError(errors, "AI_GATEWAY_API_KEY", "still contains a placeholder")
  }
  if (oidcToken && isPlaceholder(oidcToken)) {
    addError(errors, "VERCEL_OIDC_TOKEN", "still contains a placeholder")
  }
  if (launchValue === "true" && !gatewayApiKey && !oidcToken) {
    errors.push(
      "AI_GATEWAY_AUTH: AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN is required when Content Agent execution is enabled",
    )
  }

  const contentModel = env.AMS_CONTENT_AGENT_MODEL?.trim() ?? ""
  if (contentModel && !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._:-]+$/u.test(contentModel)) {
    addError(errors, "AMS_CONTENT_AGENT_MODEL", "must use provider/model format")
  }

  const requestLimit = env.AMS_AI_REQUESTS_PER_MINUTE?.trim()
  if (requestLimit) {
    const parsed = Number(requestLimit)
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 60) {
      addError(errors, "AMS_AI_REQUESTS_PER_MINUTE", "must be an integer from 1 through 60")
    }
  }

  const webPort = env.AMS_STAGING_WEB_PORT?.trim()
  if (webPort) {
    const parsed = Number(webPort)
    if (!Number.isSafeInteger(parsed) || parsed < 1024 || parsed > 65535) {
      addError(errors, "AMS_STAGING_WEB_PORT", "must be an unprivileged TCP port")
    }
  }

  return [...new Set(errors)].sort()
}

function run() {
  const file = resolve(process.argv[2] ?? ".env.staging")
  const env = parseEnvText(readFileSync(file, "utf8"))
  const errors = validateStagingConfig(env)
  if (errors.length > 0) {
    console.error("Staging preflight failed without reading or printing secret values:")
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }
  console.log("Staging preflight passed: HTTPS origin, dedicated credentials, and Stripe test mode are configured.")
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) run()
