type HeaderReader = Pick<Headers, "get">

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null
}

function normalizedOrigin(value: string | undefined | null) {
  const raw = value?.trim()
  if (!raw) return null

  try {
    const url = new URL(raw)
    if (!["https:", "http:"].includes(url.protocol)) return null
    return url.origin
  } catch {
    return null
  }
}

export function configuredNextAuthOrigin(
  env: NodeJS.ProcessEnv = process.env,
) {
  return normalizedOrigin(env.NEXTAUTH_URL)
}

export function requestOriginForAuth(
  requestUrl: string,
  headers: HeaderReader,
) {
  const request = new URL(requestUrl)
  const forwardedHost = firstHeaderValue(headers.get("x-forwarded-host"))
  const host = forwardedHost ?? firstHeaderValue(headers.get("host")) ?? request.host
  const forwardedProto = firstHeaderValue(headers.get("x-forwarded-proto"))
  const protocol = forwardedProto
    ? forwardedProto.endsWith(":")
      ? forwardedProto
      : `${forwardedProto}:`
    : request.protocol

  if (!host || !["https:", "http:"].includes(protocol)) return null

  try {
    return new URL(`${protocol}//${host}`).origin
  } catch {
    return null
  }
}

export function authOriginState(
  requestUrl: string,
  headers: HeaderReader,
  env: NodeJS.ProcessEnv = process.env,
) {
  const configuredOrigin = configuredNextAuthOrigin(env)
  const requestOrigin = requestOriginForAuth(requestUrl, headers)

  return {
    configuredOrigin,
    requestOrigin,
    matches:
      Boolean(configuredOrigin) &&
      Boolean(requestOrigin) &&
      configuredOrigin === requestOrigin,
  }
}

export function isGoogleNextAuthExchangePath(pathname: string) {
  const normalized = pathname.replace(/\/+$/u, "")
  return (
    normalized === "/api/auth/signin/google" ||
    normalized === "/api/auth/callback/google"
  )
}
