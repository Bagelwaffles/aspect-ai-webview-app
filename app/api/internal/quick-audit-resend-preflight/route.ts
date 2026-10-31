/**
 * Authenticated read-only AMS Resend Preview configuration preflight.
 * Never returns env values. GET only: no checkout, mail, storage, or mutation.
 */
import { NextRequest, NextResponse } from "next/server"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { inspectResendPreviewPreflight } from "@/lib/server/quick-audit-resend-preview-preflight"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request)
  if (!auth.ok) {
    return NextResponse.json({ ok: false, code: auth.code }, {
      status: auth.status,
      headers: { "Cache-Control": "no-store" },
    })
  }
  const result = inspectResendPreviewPreflight()
  // Owner-authenticated, read-only diagnostic. Return comparisons only,
  // never hostnames, secrets, headers, URL values or customer details.
  // Does not arm windows, issue Resend API requests, or touch storage.
  const env = process.env
  function origin(value: string | undefined) {
    try { return value ? new URL(value).origin : null } catch { return null }
  }
  const requestOrigin = origin(request.url)
  const nextAuthOrigin = origin(env.NEXTAUTH_URL)
  const publicAppOrigin = origin(env.PUBLIC_APP_URL)
  const deploymentOrigin = origin(env.VERCEL_URL ? "https://" + env.VERCEL_URL : undefined)
  const branchAlias = "https://aspect-ai-overlord-git-60e9ea-kimberleyaversbiz-4131s-projects.vercel.app"
  const originDiagnostic = {
    source: env.PUBLIC_APP_URL ? "PUBLIC_APP_URL" : env.NEXTAUTH_URL ? "NEXTAUTH_URL" : "missing",
    hasPublicAppUrl: Boolean(env.PUBLIC_APP_URL),
    hasNextAuthUrl: Boolean(env.NEXTAUTH_URL),
    hasDeploymentUrl: Boolean(env.VERCEL_URL),
    requestIsHttps: requestOrigin?.startsWith("https://") === true,
    requestMatchesBranchAlias: requestOrigin === branchAlias,
    requestMatchesNextAuth: requestOrigin !== null && requestOrigin === nextAuthOrigin,
    requestMatchesPublicApp: requestOrigin !== null && requestOrigin === publicAppOrigin,
    requestMatchesDeployment: requestOrigin !== null && requestOrigin === deploymentOrigin,
    nextAuthMatchesBranchAlias: nextAuthOrigin === branchAlias,
    publicAppMatchesBranchAlias: publicAppOrigin === branchAlias,
    deploymentMatchesBranchAlias: deploymentOrigin === branchAlias,
  }
  return NextResponse.json({
    ok: result.status === "configuration-ready",
    ...result,
    sendsEnabled: false,
    originDiagnostic,
  }, {
    status: result.status === "configuration-ready" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  })
}
