import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { recordAndroidBetaFeedback } from "@/lib/server/android-beta-testers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const feedbackSchema = z
  .object({
    email: z.string().trim().email().max(180),
    rating: z.coerce.number().int().min(1).max(5),
    device: z.string().trim().max(120).optional().default(""),
    whatWorked: z.string().trim().min(1).max(1000),
    issue: z.string().trim().max(1500).optional().default(""),
    suggestion: z.string().trim().max(1500).optional().default(""),
    consent: z.literal(true),
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
  const parsed = feedbackSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return json({ ok: false, error: "invalid_beta_feedback" }, 400)
  }

  if (parsed.data.website) {
    return json({ ok: true, saved: false, message: "Thanks for the feedback." })
  }

  const result = await recordAndroidBetaFeedback({
    email: parsed.data.email,
    rating: parsed.data.rating,
    device: parsed.data.device || null,
    whatWorked: parsed.data.whatWorked,
    issue: parsed.data.issue || null,
    suggestion: parsed.data.suggestion || null,
  })

  if (result === "tester_not_found") {
    return json({ ok: false, saved: false, error: "tester_not_found" }, 404)
  }

  if (result === "unavailable") {
    return json({ ok: false, saved: false, error: "feedback_store_unavailable" }, 503)
  }

  return json({
    ok: true,
    saved: true,
    message: "Feedback saved. Thank you for helping us improve the AMS Android app.",
  })
}
