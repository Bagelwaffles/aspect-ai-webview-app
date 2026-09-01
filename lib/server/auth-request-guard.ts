type InvalidAttemptBucket = {
  count: number
  resetAt: number
}

type GlobalWithAuthGuard = typeof globalThis & {
  __amsInvalidAuthAttempts?: Map<string, InvalidAttemptBucket>
}

const INVALID_ATTEMPT_LIMIT = 10
const INVALID_ATTEMPT_WINDOW_MS = 5 * 60_000
const MAX_CALLBACK_LENGTH = 2_048

const globalStore = globalThis as GlobalWithAuthGuard
const invalidAttempts =
  globalStore.__amsInvalidAuthAttempts ?? new Map<string, InvalidAttemptBucket>()
globalStore.__amsInvalidAuthAttempts = invalidAttempts

function decodeRepeatedly(value: string): string | null {
  let decoded = value

  try {
    for (let pass = 0; pass < 3; pass += 1) {
      const next = decodeURIComponent(decoded)
      if (next === decoded) break
      decoded = next
    }
  } catch {
    return null
  }

  return decoded
}

function allowedOrigins(requestUrl: string): Set<string> {
  const origins = new Set<string>()

  try {
    origins.add(new URL(requestUrl).origin)
  } catch {
    // A malformed request URL will be rejected by the callback validator.
  }

  const configuredUrl = process.env.NEXTAUTH_URL?.trim()
  if (configuredUrl) {
    try {
      origins.add(new URL(configuredUrl).origin)
    } catch {
      // Do not trust a malformed deployment setting.
    }
  }

  return origins
}

export function isSafeAuthCallbackUrl(value: string, requestUrl: string): boolean {
  if (!value || value.length > MAX_CALLBACK_LENGTH) return false
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return false

  const decoded = decodeRepeatedly(value)
  if (!decoded || /[\\\u0000-\u001f\u007f]/.test(decoded)) return false

  if (decoded.startsWith("/") && !decoded.startsWith("//")) {
    return true
  }

  try {
    const callback = new URL(decoded)
    return (
      (callback.protocol === "https:" || callback.protocol === "http:") &&
      allowedOrigins(requestUrl).has(callback.origin)
    )
  } catch {
    return false
  }
}

export async function authCallbackUrlFromRequest(request: Request): Promise<string | null> {
  const requestUrl = new URL(request.url)
  const queryValue = requestUrl.searchParams.get("callbackUrl")
  if (queryValue !== null) return queryValue

  if (request.method !== "POST") return null

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? ""
  if (!contentType.includes("application/x-www-form-urlencoded") &&
      !contentType.includes("multipart/form-data")) {
    return null
  }

  try {
    const form = await request.clone().formData()
    const value = form.get("callbackUrl")
    return typeof value === "string" ? value : null
  } catch {
    return ""
  }
}

function clientKey(request: Request): string {
  return (
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  )
}

export function recordInvalidAuthAttempt(
  request: Request,
  now = Date.now(),
): { blocked: boolean; retryAfterSeconds: number } {
  const key = clientKey(request)
  const current = invalidAttempts.get(key)
  const bucket =
    !current || current.resetAt <= now
      ? { count: 0, resetAt: now + INVALID_ATTEMPT_WINDOW_MS }
      : current

  bucket.count += 1
  invalidAttempts.set(key, bucket)

  return {
    blocked: bucket.count > INVALID_ATTEMPT_LIMIT,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)),
  }
}
