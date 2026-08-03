import { NextResponse } from "next/server"

import { isEntitlementStoreConfigured } from "@/lib/server/entitlements"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function configured(...names: string[]): boolean {
  return names.every((name) => Boolean(process.env[name]?.trim()))
}

export async function GET() {
  const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown"

  return NextResponse.json(
    {
      ok: true,
      status: "ok",
      service: "ams-web",
      environment,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "unknown",
      persistence: {
        database: "not_configured_in_web_shell",
        entitlements: isEntitlementStoreConfigured() ? "configured" : "missing",
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
        xai: configured("XAI_API_KEY", "XAI_MODEL") ? "configured" : "missing",
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
        n8n: configured("N8N_WEBHOOK_SECRET") ? "configured" : "missing",
        internalApiAuth: configured("AMS_INTERNAL_API_KEY") ? "configured" : "missing",
      },
      dependencyConnectionsTested: false,
      productionDependenciesUsed: false,
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  )
}
