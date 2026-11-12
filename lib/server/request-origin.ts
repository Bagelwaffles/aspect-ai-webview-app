import type { NextRequest } from "next/server"

function parsedOrigin(value: string | null | undefined, allowBareHost = false): string | null {
  const candidate = value?.trim()
  if (!candidate) return null
  try {
    const url = new URL(allowBareHost && !candidate.includes("://") ? "https://" + candidate : candidate)
    const localHost = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)
    const secureProtocol = url.protocol === "https:" || (url.protocol === "http:" && localHost)
    if (!secureProtocol || url.username || url.password) return null
    return url.origin
  } catch {
    return null
  }
}

function configuredOrigin(env: NodeJS.ProcessEnv): {
  source: "PUBLIC_APP_URL" | "NEXTAUTH_URL" | "missing"
  origin: string | null
} {
  const publicUrl = env.PUBLIC_APP_URL?.trim()
  const nextAuthUrl = env.NEXTAUTH_URL?.trim()
  const isMaintenancePreview =
    env.VERCEL_ENV === "preview" &&
    env.VERCEL_GIT_COMMIT_REF === "feat/ams-maintenance-agent-pipeline-20261015"
  // This branch has an explicit branch-scoped NEXTAUTH_URL override; prefer
  // it over any project-wide public URL so the OAuth and CSRF origins agree.
  if (isMaintenancePreview && nextAuthUrl) {
    return { source: "NEXTAUTH_URL", origin: parsedOrigin(nextAuthUrl) }
  }
  if (publicUrl) return { source: "PUBLIC_APP_URL", origin: parsedOrigin(publicUrl) }
  if (nextAuthUrl) return { source: "NEXTAUTH_URL", origin: parsedOrigin(nextAuthUrl) }
  return { source: "missing", origin: null }
}

export type TrustedOriginDiagnostics = {
  requestOrigin: string
  originHeaderOrigin: string | null
  refererOrigin: string | null
  configuredSource: "PUBLIC_APP_URL" | "NEXTAUTH_URL" | "missing"
  configuredOrigin: string | null
  originHeaderMatchesConfigured: boolean
  requestOriginMatchesConfigured: boolean
  refererOriginMatchesConfigured: boolean
  secFetchSite: string | null
  hostHeader: string | null
  forwardedHost: string | null
  vercelEnv: string | null
  vercelGitCommitRef: string | null
  vercelUrlOrigin: string | null
  vercelBranchUrlOrigin: string | null
}

export function trustedOriginDiagnostics(
  request: NextRequest,
  env: NodeJS.ProcessEnv = process.env,
): TrustedOriginDiagnostics {
  const configured = configuredOrigin(env)
  const originHeaderOrigin = parsedOrigin(request.headers.get("origin"))
  const refererOrigin = parsedOrigin(request.headers.get("referer"))
  const requestOrigin = request.nextUrl.origin
  return {
    requestOrigin,
    originHeaderOrigin,
    refererOrigin,
    configuredSource: configured.source,
    configuredOrigin: configured.origin,
    originHeaderMatchesConfigured: Boolean(originHeaderOrigin && configured.origin === originHeaderOrigin),
    requestOriginMatchesConfigured: Boolean(configured.origin && configured.origin === requestOrigin),
    refererOriginMatchesConfigured: Boolean(refererOrigin && configured.origin === refererOrigin),
    secFetchSite: request.headers.get("sec-fetch-site"),
    hostHeader: request.headers.get("host"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    vercelEnv: env.VERCEL_ENV ?? null,
    vercelGitCommitRef: env.VERCEL_GIT_COMMIT_REF ?? null,
    vercelUrlOrigin: parsedOrigin(env.VERCEL_URL, true),
    vercelBranchUrlOrigin: parsedOrigin(env.VERCEL_BRANCH_URL, true),
  }
}

export function requestHasTrustedAppOrigin(
  request: NextRequest,
  env: NodeJS.ProcessEnv = process.env,
) {
  const diagnostics = trustedOriginDiagnostics(request, env)
  if (!diagnostics.configuredOrigin) return false

  // A present Origin header is authoritative: never override a mismatch with Referer.
  if (request.headers.has("origin")) {
    if (diagnostics.originHeaderMatchesConfigured) return true

    // Vercel may serve the same Preview branch from its immutable deployment
    // URL as well as its stable branch alias. Trust those system-provided
    // origins only on this exact Preview branch, never on Production or other PRs.
    const isMaintenancePreview =
      env.VERCEL_ENV === "preview" &&
      env.VERCEL_GIT_COMMIT_REF === "feat/ams-maintenance-agent-pipeline-20261015"
    if (!isMaintenancePreview) return false
    return Boolean(
      diagnostics.originHeaderOrigin &&
      [diagnostics.vercelUrlOrigin, diagnostics.vercelBranchUrlOrigin]
        .filter((value): value is string => Boolean(value))
        .includes(diagnostics.originHeaderOrigin),
    )
  }

  // Some browser/proxy combinations omit Origin on same-origin requests.
  // Referer is accepted only when Fetch Metadata independently says same-origin.
  return request.headers.get("sec-fetch-site") === "same-origin" &&
    diagnostics.refererOriginMatchesConfigured
}
