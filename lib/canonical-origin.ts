export const AMS_CANONICAL_ORIGIN = "https://www.aspectmarketingsolutions.app" as const
export const AMS_CANONICAL_HOST = "www.aspectmarketingsolutions.app" as const
export const AMS_APEX_HOST = "aspectmarketingsolutions.app" as const

function cleanHost(value: string | null | undefined) {
  return value?.split(",")[0]?.trim().toLowerCase().replace(/:\d+$/u, "") ?? ""
}

export function requestHostForCanonicalization(
  headers: Pick<Headers, "get">,
) {
  return (
    cleanHost(headers.get("x-forwarded-host")) ||
    cleanHost(headers.get("host"))
  )
}

export function canonicalProductionUrl(
  requestUrl: string,
  headers: Pick<Headers, "get">,
): URL | null {
  const host = requestHostForCanonicalization(headers)
  if (host !== AMS_APEX_HOST) return null

  const incoming = new URL(requestUrl)
  return new URL(
    `${incoming.pathname}${incoming.search}`,
    AMS_CANONICAL_ORIGIN,
  )
}
