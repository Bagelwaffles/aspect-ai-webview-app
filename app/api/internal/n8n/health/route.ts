import { NextRequest, NextResponse } from "next/server"

import { constantTimeStringEqual } from "@/lib/server/internal-api-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.N8N_WEBHOOK_SECRET?.trim()
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
  const baseUrl = process.env.N8N_BASE_URL?.trim()
  if (!baseUrl) {
    return { online: false, latencyMs: 0, error: "N8N_BASE_URL not configured" }
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

  const baseUrl = process.env.N8N_BASE_URL?.trim()
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
        configured: Boolean(process.env.N8N_WEBHOOK_SECRET?.trim()),
        path: "/api/webhooks/n8n",
      },
      warnings: sanitizedUrl?.localOnly ? ["N8N_BASE_URL is local-only and unavailable from Vercel."] : [],
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
