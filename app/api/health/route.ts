import { NextResponse } from "next/server"

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
      database: "not_configured_in_web_shell",
      dependencies: {
        stripe: configured("STRIPE_SECRET_KEY") ? "configured" : "missing",
        relevance: configured(
          "RELEVANCE_API_KEY",
          "RELEVANCE_AUTH_TOKEN",
          "RELEVANCE_REGION",
          "RELEVANCE_PROJECT_ID",
          "RELEVANCE_AGENT_API_URL",
        )
          ? "configured"
          : "missing",
        n8n: configured("N8N_MCP_KEY") ? "configured" : "missing",
        internalApiAuth: configured("AMS_INTERNAL_API_KEY") ? "configured" : "missing",
      },
      dependencyConnectionsTested: false,
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  )
}
