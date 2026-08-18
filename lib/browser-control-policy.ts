export const BROWSER_ACTIONS = ["open", "inspect", "screenshot", "click", "fill", "submit"] as const

export type BrowserAction = (typeof BROWSER_ACTIONS)[number]
export type BrowserRisk = "green" | "yellow" | "red"

export type BrowserJobInput = {
  action: BrowserAction
  url: string
  selector?: string
  value?: string
  note?: string
}

const RISK_BY_ACTION: Record<BrowserAction, BrowserRisk> = {
  open: "green",
  inspect: "green",
  screenshot: "green",
  click: "yellow",
  fill: "yellow",
  submit: "red",
}

export const DEFAULT_BROWSER_ALLOWED_HOSTS = [
  "aspectmarketingsolutions.app",
  "www.aspectmarketingsolutions.app",
  "github.com",
  "www.github.com",
  "fiverr.com",
  "www.fiverr.com",
  "facebook.com",
  "www.facebook.com",
  "business.facebook.com",
  "linkedin.com",
  "www.linkedin.com",
  "dashboard.stripe.com",
  "stripe.com",
  "aspectmarketingsolutions.app.n8n.cloud",
  "youtube.com",
  "www.youtube.com",
  "studio.youtube.com",
] as const

export function riskForBrowserAction(action: BrowserAction): BrowserRisk {
  return RISK_BY_ACTION[action]
}

export function parseBrowserAction(value: unknown): BrowserAction | null {
  return typeof value === "string" && (BROWSER_ACTIONS as readonly string[]).includes(value)
    ? (value as BrowserAction)
    : null
}

export function browserAllowedHosts(configured = process.env.AMS_BROWSER_ALLOWED_HOSTS): string[] {
  const custom = configured
    ?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)

  return custom?.length ? Array.from(new Set(custom)) : [...DEFAULT_BROWSER_ALLOWED_HOSTS]
}

export function isAllowedBrowserUrl(rawUrl: string, configuredHosts?: string): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }

  if (url.username || url.password) return false
  if (url.protocol !== "https:") {
    if (process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)) {
      return true
    }
    return false
  }

  const hostname = url.hostname.toLowerCase()
  return browserAllowedHosts(configuredHosts).includes(hostname)
}

export function validateBrowserJobInput(input: unknown): { ok: true; value: BrowserJobInput } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "Job body must be an object" }

  const candidate = input as Record<string, unknown>
  const action = parseBrowserAction(candidate.action)
  if (!action) return { ok: false, error: "Unsupported browser action" }

  if (typeof candidate.url !== "string" || candidate.url.length > 2048 || !isAllowedBrowserUrl(candidate.url)) {
    return { ok: false, error: "URL is not on the browser-control allowlist" }
  }

  const selector = typeof candidate.selector === "string" ? candidate.selector.trim().slice(0, 500) : undefined
  const value = typeof candidate.value === "string" ? candidate.value.slice(0, 5000) : undefined
  const note = typeof candidate.note === "string" ? candidate.note.trim().slice(0, 500) : undefined

  if (["click", "fill", "submit"].includes(action) && !selector) {
    return { ok: false, error: `${action} requires a selector` }
  }
  if (action === "fill" && value === undefined) {
    return { ok: false, error: "fill requires a value" }
  }

  return { ok: true, value: { action, url: candidate.url, selector, value, note } }
}
