import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  CREATOR_PLATFORM_VALUES,
  consumeCreatorPilotRateLimit,
  saveCreatorPilotApplication,
} from "@/lib/server/creator-pilot"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const pilotSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(180),
    creatorHandle: z.string().trim().min(1).max(80),
    primaryPlatform: z.enum(CREATOR_PLATFORM_VALUES),
    platforms: z.array(z.enum(CREATOR_PLATFORM_VALUES)).max(CREATOR_PLATFORM_VALUES.length).default([]),
    primaryGame: z.string().trim().max(120).optional().default(""),
    creatorCategories: z.array(z.string().trim().min(1).max(60)).max(8).default([]),
    goals: z.string().trim().min(10).max(1200),
    biggestBottleneck: z.string().trim().min(10).max(1200),
    currentSetup: z.string().trim().max(1000).optional().default(""),
    weeklyStreamHours: z.number().int().min(0).max(100).nullable().optional().default(null),
    consentContact: z.literal(true),
    source: z.string().trim().max(120).optional().default("creators-page"),
    website: z.string().trim().max(200).optional().default(""),
  })
  .strict()

function json(body: Record<string, unknown>, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...headers,
    },
  })
}

function requestFingerprint(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  const realIp = request.headers.get("x-real-ip")?.trim()
  const userAgent = request.headers.get("user-agent")?.trim().slice(0, 160) ?? "unknown-agent"
  return `${forwarded || realIp || "unknown-ip"}|${userAgent}`
}

export async function POST(request: NextRequest) {
  const parsed = pilotSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return json({ ok: false, saved: false, error: "invalid_creator_pilot_application" }, 400)
  }

  // Honeypot: accept the request without persisting it so automated form fillers get no signal.
  if (parsed.data.website) {
    return json({
      ok: true,
      saved: false,
      message: "Thanks. Your creator pilot request was received.",
    })
  }

  const rateLimit = await consumeCreatorPilotRateLimit(requestFingerprint(request))
  if (!rateLimit.available) {
    return json({ ok: false, saved: false, error: "creator_pilot_intake_unavailable" }, 503)
  }
  if (!rateLimit.allowed) {
    return json(
      { ok: false, saved: false, error: "creator_pilot_rate_limited" },
      429,
      { "Retry-After": String(rateLimit.retryAfterSeconds) },
    )
  }

  const result = await saveCreatorPilotApplication({
    name: parsed.data.name,
    email: parsed.data.email,
    creatorHandle: parsed.data.creatorHandle,
    primaryPlatform: parsed.data.primaryPlatform,
    platforms: parsed.data.platforms,
    primaryGame: parsed.data.primaryGame || null,
    creatorCategories: parsed.data.creatorCategories,
    goals: parsed.data.goals,
    biggestBottleneck: parsed.data.biggestBottleneck,
    currentSetup: parsed.data.currentSetup || null,
    weeklyStreamHours: parsed.data.weeklyStreamHours,
    source: parsed.data.source || "creators-page",
  })

  if (result.status === "unavailable") {
    return json({ ok: false, saved: false, error: "creator_pilot_intake_unavailable" }, 503)
  }

  return json({
    ok: true,
    saved: true,
    existing: result.status === "updated",
    applicationId: result.application?.application_id ?? null,
    message:
      result.status === "updated"
        ? "Your AMS Creator Pilot application was updated."
        : "Your AMS Creator Pilot application was received.",
  })
}
