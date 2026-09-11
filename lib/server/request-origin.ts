import type { NextRequest } from "next/server"

export function requestHasTrustedAppOrigin(
  request: NextRequest,
  env: NodeJS.ProcessEnv = process.env,
) {
  const origin = request.headers.get("origin")
  const configuredUrl = env.PUBLIC_APP_URL ?? env.NEXTAUTH_URL
  if (!origin || !configuredUrl) return false

  try {
    return new URL(origin).origin === new URL(configuredUrl).origin
  } catch {
    return false
  }
}
