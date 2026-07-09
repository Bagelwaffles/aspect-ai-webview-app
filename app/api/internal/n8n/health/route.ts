import { NextResponse } from "next/server";

/**
 * Internal n8n Health Endpoint
 * Protected by internal auth middleware/pattern.
 * Does not expose secrets.
 */

const N8N_BASE_URL = process.env.N8N_BASE_URL;
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET;

function sanitizeBaseUrl(raw?: string) {
  if (!raw) return null;

  try {
    const url = new URL(raw);
    return {
      protocol: url.protocol.replace(":", ""),
      host: url.hostname,
      port: url.port || null,
      localOnly:
        url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "host.docker.internal",
    };
  } catch {
    return {
      protocol: null,
      host: "invalid",
      port: null,
      localOnly: false,
    };
  }
}

async function checkN8nHealth(): Promise<{
  online: boolean;
  latencyMs: number;
  statusCode?: number;
  error?: string;
}> {
  if (!N8N_BASE_URL) {
    return {
      online: false,
      latencyMs: 0,
      error: "N8N_BASE_URL not configured",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const start = Date.now();

    const response = await fetch(`${N8N_BASE_URL.replace(/\/$/, "")}/healthz`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });

    return {
      online: response.ok,
      latencyMs: Date.now() - start,
      statusCode: response.status,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to reach n8n instance";

    return {
      online: false,
      latencyMs: 0,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  try {
    /**
     * IMPORTANT:
     * Add existing internal auth check here if this file is not already
     * protected by middleware/wrapper.
     */

    const health = await checkN8nHealth();
    const sanitizedUrl = sanitizeBaseUrl(N8N_BASE_URL);

    return NextResponse.json({
      ok: health.online,
      status: health.online ? "healthy" : "unhealthy",
      n8n: {
        configured: Boolean(N8N_BASE_URL),
        online: health.online,
        latencyMs: health.latencyMs,
        statusCode: health.statusCode ?? null,
        error: health.error ?? null,
        endpoint: sanitizedUrl,
      },
      webhook: {
        configured: Boolean(N8N_WEBHOOK_SECRET),
        path: "/webhook/vo-app",
      },
      warnings: sanitizedUrl?.localOnly
        ? [
            "N8N_BASE_URL is local-only. This works locally but will not work from Vercel production unless n8n has a reachable public/internal URL.",
          ]
        : [],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[n8n] Status check error:", error);

    return NextResponse.json(
      {
        ok: false,
        status: "error",
        error: "Failed to check n8n status",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
