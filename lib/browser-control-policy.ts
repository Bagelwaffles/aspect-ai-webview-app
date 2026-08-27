export const BROWSER_ACTIONS = ["open", "inspect", "screenshot", "click", "fill", "upload", "capture_secret", "submit"] as const

export type BrowserAction = (typeof BROWSER_ACTIONS)[number]
export type BrowserRisk = "green" | "yellow" | "red"

export type BrowserJobInput = {
  action: BrowserAction
  url: string
  selector?: string
  value?: string
  note?: string
  idempotencyKey?: string
  useCurrentPage?: boolean
}

const RISK_BY_ACTION: Record<BrowserAction, BrowserRisk> = {
  open: "green",
  inspect: "green",
  screenshot: "green",
  click: "yellow",
  fill: "red",
  upload: "red",
  capture_secret: "red",
  submit: "red",
}

const INTERACTIVE_ACTIONS: BrowserAction[] = ["click", "fill", "upload", "capture_secret", "submit"]
const SAFE_UPLOAD_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._() -]{0,159}$/
const SAFE_UPLOAD_EXTENSION = /\.(png|jpe?g|webp|gif|pdf|csv|txt|zip|aab|apk)$/i
const SECRET_HANDLE = /^ams-secret-[0-9a-f-]{36}$/i

// Phase-1 perimeter: keep browser control intentionally narrow.
// Add business sites one at a time only after a dedicated onboarding/proof pass.
export const DEFAULT_BROWSER_ALLOWED_HOSTS = [
  "aspectmarketingsolutions.app",
  "www.aspectmarketingsolutions.app",
  "github.com",
  "www.github.com",
  "linkedin.com",
  "www.linkedin.com",
  "developer.linkedin.com",
  "developers.linkedin.com",
  "facebook.com",
  "www.facebook.com",
  "developers.facebook.com",
  "instagram.com",
  "www.instagram.com",
  "pinterest.com",
  "www.pinterest.com",
  "developers.pinterest.com",
  "youtube.com",
  "www.youtube.com",
  "console.cloud.google.com",
  "play.google.com",
  "vercel.com",
  "fiverr.com",
  "www.fiverr.com",
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

export function isBrowserSecretHandle(value: string): boolean {
  return SECRET_HANDLE.test(value.trim())
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
  let value = typeof candidate.value === "string" ? candidate.value.slice(0, 5000) : undefined
  const note = typeof candidate.note === "string" ? candidate.note.trim().slice(0, 500) : undefined
  const idempotencyKey = typeof candidate.idempotencyKey === "string" ? candidate.idempotencyKey.trim().slice(0, 160) : undefined
  const useCurrentPage = candidate.useCurrentPage === true

  if (useCurrentPage && !INTERACTIVE_ACTIONS.includes(action)) {
    return { ok: false, error: "useCurrentPage is only supported for interactive browser actions" }
  }

  if (INTERACTIVE_ACTIONS.includes(action) && !selector) {
    return { ok: false, error: `${action} requires a selector` }
  }
  if (action === "fill" && value === undefined) {
    return { ok: false, error: "fill requires a value or an opaque AMS secret handle" }
  }
  if (action === "upload") {
    value = value?.trim()
    if (!value) return { ok: false, error: "upload requires a filename" }
    if (!SAFE_UPLOAD_FILENAME.test(value) || !SAFE_UPLOAD_EXTENSION.test(value) || value.includes("..")) {
      return { ok: false, error: "upload filename must be a safe local filename with an approved extension" }
    }
  }
  if (action === "capture_secret" && value !== undefined) {
    return { ok: false, error: "capture_secret does not accept a value; the secret stays on the worker" }
  }
  if (action === "fill" && value?.startsWith("ams-secret-") && !isBrowserSecretHandle(value)) {
    return { ok: false, error: "Invalid AMS secret handle" }
  }

  if (idempotencyKey && !/^[A-Za-z0-9._:-]{8,160}$/.test(idempotencyKey)) {
    return { ok: false, error: "idempotencyKey must be 8-160 safe characters" }
  }

  return {
    ok: true,
    value: {
      action,
      url: candidate.url,
      selector,
      value,
      note,
      idempotencyKey,
      useCurrentPage: useCurrentPage || undefined,
    },
  }
}
