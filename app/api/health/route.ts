import { createHash } from "node:crypto"
import { NextResponse } from "next/server"

import { isInternalApiConfigured } from "@/lib/server/internal-api-auth"
import { checkRedisReadiness, probeRedisRestTransport } from "@/lib/server/redis-readiness"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function configured(...names: string[]): boolean {
  return names.every((name) => Boolean(process.env[name]?.trim()))
}

function configuredAny(...names: string[]): boolean {
  return names.some((name) => Boolean(process.env[name]?.trim()))
}

/**
 * Non-reversible endpoint fingerprint for temporary, authenticated Preview acceptance.
 * It identifies which expected datastore is misconfigured without publishing the hostname.
 * Remove after the Preview Redis binding is repaired.
 */
function genericRedisHostFingerprint(): string | null {
  const candidate = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim()
  if (!candidate) return null
  try {
    return createHash("sha256").update(new URL(candidate).hostname.toLowerCase()).digest("hex").slice(0, 16)
  } catch {
    return null
  }
}

function nativeVercelGatewayAuthAvailable(): boolean {
  return process.env.VERCEL === "1" && Boolean(process.env.VERCEL_ENV?.trim())
}

export async function GET() {
  const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown"
  const redis = await checkRedisReadiness()
  const ready = redis.state === "ready"
  const diagnosticPreview = environment === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === "feat/ams-audit-buyer-link-integration-20261029"
  const transportCategory = diagnosticPreview && redis.failureCategory === "unknown"
    ? await probeRedisRestTransport()
    : null
  const redisHostFingerprint = diagnosticPreview && (transportCategory === "auth" || redis.failureCategory === "auth")
    ? genericRedisHostFingerprint()
    : null
  const aiGatewayConfigured =
    configuredAny("AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN") ||
    nativeVercelGatewayAuthAvailable()
  const n8nExplicitlyEnabled = process.env.AMS_N8N_ENABLED?.trim().toLowerCase() === "true"

  return NextResponse.json(
    {
      ok: ready,
      status: ready ? "ready" : "not_ready",
      service: "ams-web",
      environment,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "unknown",
      persistence: {
        redis: {
          required: true,
          status: redis.state,
          configured: redis.configured,
          checked: redis.checked,
          latencyMs: redis.latencyMs,
          // Only this isolated, owner-controlled Preview exposes a generic diagnostic category.
          // Do not expose the exception message, Redis URL, or credentials.
          ...(diagnosticPreview && redis.failureCategory
            ? { failureCategory: redis.failureCategory }
            : {}),
          ...(transportCategory ? { transportCategory } : {}),
          ...(redisHostFingerprint ? { hostFingerprint: redisHostFingerprint } : {}),
        },
        relationalDatabase: "not_approved",
      },
      dependencies: {
        customerAuth: configured(
          "GOOGLE_CLIENT_ID",
          "GOOGLE_CLIENT_SECRET",
          "NEXTAUTH_SECRET",
          "NEXTAUTH_URL",
        )
          ? "configured"
          : "missing",
        aiGateway: aiGatewayConfigured ? "configured" : "missing",
        stripeBilling: configured(
          "STRIPE_SECRET_KEY",
          "STRIPE_WEBHOOK_SECRET",
          "AMS_STRIPE_STARTER_PRICE_ID",
          "AMS_STRIPE_GROWTH_PRICE_ID",
          "AMS_STRIPE_PRO_PRICE_ID",
        )
          ? "configured"
          : "missing",
        relevance: configured(
          "RELEVANCE_API_KEY",
          "RELEVANCE_AUTH_TOKEN",
          "RELEVANCE_REGION",
          "RELEVANCE_PROJECT_ID",
          "RELEVANCE_AGENT_API_URL",
        )
          ? "configured"
          : "missing",
        n8n: n8nExplicitlyEnabled ? "optional_enabled" : "disabled_optional",
        n8nApiKey: "not_required",
        internalApiAuth: isInternalApiConfigured() ? "configured" : "missing",
      },
      dependencyConnectionsTested: {
        redis: redis.checked,
      },
      timestamp: new Date().toISOString(),
    },
    {
      status: ready ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  )
}
