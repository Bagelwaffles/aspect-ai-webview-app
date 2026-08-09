import { NextResponse, type NextRequest } from "next/server"

import { authorizeInternalApiRequest } from "@/lib/server/customer-api-auth"
import {
  approveSocialPost,
  buildPublishPreview,
  getPlatformCredentialState,
  prepareSocialPost,
  socialPostSchema,
} from "@/lib/server/social-publisher"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  if (!authorizeInternalApiRequest(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  }

  return NextResponse.json({
    ok: true,
    mode: "approval-first",
    deliveryEnabled: false,
    credentials: getPlatformCredentialState(),
    supportedPlatforms: ["facebook", "instagram", "linkedin", "tiktok"],
  })
}

export async function POST(request: NextRequest) {
  if (!authorizeInternalApiRequest(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }

  const parsed = socialPostSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_SOCIAL_POST", issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const draft = prepareSocialPost(parsed.data)
  const approved = approveSocialPost(draft)

  return NextResponse.json({
    ok: true,
    deliveryEnabled: false,
    record: buildPublishPreview(approved),
    note:
      approved.status === "ready"
        ? "Credentials detected. Delivery remains disabled until the platform adapter is verified."
        : "Post prepared, but platform credentials are incomplete.",
  })
}
