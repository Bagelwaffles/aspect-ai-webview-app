const CALLBACK_BASE_URL = "https://callback.invalid"
const CONTROL_OR_BACKSLASH = /[\\\u0000-\u001f\u007f]/
const ENCODED_SEPARATOR_OR_CONTROL = /%(?:25)*(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i

function unsafeDecodedPath(pathname: string): boolean {
  if (ENCODED_SEPARATOR_OR_CONTROL.test(pathname)) return true

  let decoded = pathname

  for (let depth = 0; depth < 3; depth += 1) {
    if (!decoded.startsWith("/") || decoded.startsWith("//") || CONTROL_OR_BACKSLASH.test(decoded)) {
      return true
    }

    let next = ""
    try {
      next = decodeURIComponent(decoded)
    } catch {
      return true
    }

    if (next === decoded) return false
    decoded = next
  }

  return !decoded.startsWith("/") || decoded.startsWith("//") || CONTROL_OR_BACKSLASH.test(decoded)
}

export function safeRelativeCallbackPath(value: string | null | undefined, fallback: string): string {
  if (!value || CONTROL_OR_BACKSLASH.test(value)) return fallback

  const candidate = value.trim()
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return fallback

  const pathEnd = candidate.search(/[?#]/)
  const pathname = pathEnd === -1 ? candidate : candidate.slice(0, pathEnd)
  if (unsafeDecodedPath(pathname)) return fallback

  try {
    const parsed = new URL(candidate, CALLBACK_BASE_URL)
    if (parsed.origin !== CALLBACK_BASE_URL || parsed.username || parsed.password) return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}
