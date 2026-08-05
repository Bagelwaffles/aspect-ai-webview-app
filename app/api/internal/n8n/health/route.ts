import { NextRequest, NextResponse } from "next/server"

import { constantTimeStringEqual } from "@/lib/server/internal-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.AMS_INTERNAL_API_KEY?.trim()
  const supplied = request.headers.get("x-vo-secret")?.trim()
  return Boolean(expected && supplied && constantTimeStringEqual(supplied, expected))
}

function sanitizeBaseUrl(raw?: string) {
  if (!raw) return null

  try {
    const url = new URL(raw)
    return {
      protocol: url.protocol.replace(":", ""),
      host: url.hostname,
      port: url.port || null,
      localOnly: ["localhost", "127.0.0.1", "host.docker.internal"].includes(url.hostname),
    }
  } catch {
    return {
      protocol: null,
      host: "invalid",
      port: null,
      localOnly: false,
    }
  }
}

async function checkN8nHealth() {
  const baseUrl = process.env.AMS_N8N_URL?.trim()
  if (!baseUrl) {
    return { online: false, latencyMs: 0, error: "AMS_N8N_URL not configured" }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const startedAt = Date.now()
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/healthz`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    })

    return {
      online: response.ok,
      latencyMs: Date.now() - startedAt,
      statusCode: response.status,
    }
  } catch {
    return { online: false, latencyMs: 0, error: "Unable to reach n8n instance" }
  } finally {
    clearTimeout(timeout)
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, status: "unauthorized", error: "Internal authentication required" },
      { status: 401 },
    )
  }

  const baseUrl = process.env.AMS_N8N_URL?.trim()
  const health = await checkN8nHealth()
  const sanitizedUrl = sanitizeBaseUrl(baseUrl)

  return NextResponse.json(
    {
      ok: health.online,
      status: health.online ? "healthy" : "unhealthy",
      n8n: {
        configured: Boolean(baseUrl),
        online: health.online,
        latencyMs: health.latencyMs,
        statusCode: "statusCode" in health ? health.statusCode : null,
        error: health.error ?? null,
        endpoint: sanitizedUrl,
      },
      webhook: {
        authMethod: "n8n_header_auth",
        requiredHeader: "x-ams-internal-key",
        internalKeyConfigured: Boolean(process.env.AMS_N8N_INTERNAL_KEY?.trim()),
        urlConfigured: Boolean(process.env.AMS_N8N_ORCHESTRATOR_WEBHOOK_URL?.trim()),
        apiKeyRequired: false,
        path: process.env.AMS_N8N_ORCHESTRATOR_WEBHOOK_URL ? "configured" : "missing",
      },
      warnings: sanitizedUrl?.localOnly ? ["AMS_N8N_URL is local-only and unavailable from Vercel."] : [],
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
