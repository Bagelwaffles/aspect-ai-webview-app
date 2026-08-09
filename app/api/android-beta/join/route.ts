import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { joinAndroidBetaTester } from "@/lib/server/android-beta-testers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const joinSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    email: z.string().trim().email().max(180),
    androidDevice: z.string().trim().min(1).max(120),
    commitment14Days: z.literal(true),
    source: z.string().trim().max(80).optional().default(""),
    notes: z.string().trim().max(600).optional().default(""),
    website: z.string().trim().max(200).optional().default(""),
  })
  .strict()

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function POST(request: NextRequest) {
  const parsed = joinSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return json({ ok: false, error: "invalid_tester_signup" }, 400)
  }

  if (parsed.data.website) {
    return json({ ok: true, saved: false, message: "Thanks. Your tester request was received." })
  }

  const result = await joinAndroidBetaTester({
    firstName: parsed.data.firstName,
    email: parsed.data.email,
    androidDevice: parsed.data.androidDevice,
    source: parsed.data.source || null,
    notes: parsed.data.notes || null,
  })

  if (result.status === "unavailable") {
    return json({ ok: false, saved: false, error: "tester_roster_unavailable" }, 503)
  }

  return json({
    ok: true,
    saved: true,
    existing: result.status === "existing",
    testerId: result.tester?.id ?? null,
    message:
      result.status === "existing"
        ? "You are already on the AMS Android beta tester roster."
        : "You are on the AMS Android beta tester roster. We will use this email for the closed-test invitation.",
  })
}
