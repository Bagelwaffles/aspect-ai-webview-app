import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { constantTimeStringEqual } from "@/lib/server/internal-api-auth"
import type { LiveResearchResult } from "@/lib/server/live-research"
import {
  isManagedIntelligencePilotConfigured,
  runManagedIntelligencePilot,
} from "@/lib/server/reverse-intelligence-managed-pilot"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

const sourceSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    url: z.string().url(),
    snippet: z.string().trim().min(1).max(1_200),
    score: z.number().min(0).max(1).nullable(),
    publishedDate: z.string().nullable(),
  })
  .strict()

const requestSchema = z
  .object({
    query: z.string().trim().min(3).max(500),
    topic: z.enum(["general", "news"]).default("news"),
    researchedAt: z.string().datetime(),
    providerRequestId: z.string().nullable().default(null),
    sources: z.array(sourceSchema).min(1).max(8),
  })
  .strict()

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

function isPreviewProbeAuthorized(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") return false

  const expected = process.env.AMS_MANAGED_INTELLIGENCE_PROBE_TOKEN?.trim()
  if (!expected) return false

  const authorization = request.headers.get("authorization")?.trim()
  if (!authorization?.startsWith("Bearer ")) return false

  const supplied = authorization.slice("Bearer ".length).trim()
  return supplied.length > 0 && constantTimeStringEqual(supplied, expected)
}

export async function POST(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") {
    return json({ ok: false, code: "NOT_FOUND" }, 404)
  }

  if (!isPreviewProbeAuthorized(request)) {
    return json({ ok: false, code: "MANAGED_INTELLIGENCE_PROBE_AUTH_REQUIRED" }, 401)
  }

  if (!isManagedIntelligencePilotConfigured()) {
    return json({ ok: false, code: "MANAGED_INTELLIGENCE_NOT_CONFIGURED" }, 503)
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return json({ ok: false, code: "MANAGED_INTELLIGENCE_PROBE_INVALID" }, 400)
  }

  try {
    const result = await runManagedIntelligencePilot(parsed.data as LiveResearchResult)
    return json({
      ok: true,
      sessionId: result.sessionId,
      turnId: result.turnId,
      model: result.model,
      outputText: result.outputText,
      latencyMs: result.latencyMs,
      usage: result.usage,
    })
  } catch (error) {
    const code = error instanceof Error ? error.message : "MANAGED_INTELLIGENCE_FAILED"
    const status =
      code === "MANAGED_INTELLIGENCE_AUTH_FAILED"
        ? 502
        : code === "MANAGED_INTELLIGENCE_RATE_LIMITED"
          ? 503
          : code === "MANAGED_INTELLIGENCE_TIMEOUT"
            ? 504
            : 502
    return json({ ok: false, code }, status)
  }
}
