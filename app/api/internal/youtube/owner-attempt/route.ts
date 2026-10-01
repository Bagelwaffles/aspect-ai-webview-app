import { getToken } from "next-auth/jwt"
import { NextRequest, NextResponse } from "next/server"
import { customerSubjectFromProviderSubject } from "@/lib/auth"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import {
  createYouTubeOwnerAttempt,
  YOUTUBE_OWNER_ATTEMPT_COOKIE,
  YOUTUBE_OWNER_ATTEMPT_TTL,
} from "@/lib/server/youtube-owner-attempt"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!auth.ok) return NextResponse.json({ ok: false, code: auth.code }, { status: auth.status })
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
    if (
      typeof token?.sub !== "string" ||
      typeof token.email !== "string" ||
      token.email.trim().toLowerCase() !== auth.principal.billingEmail ||
      customerSubjectFromProviderSubject(token.sub) !== auth.principal.subject
    ) throw new Error("YOUTUBE_OWNER_REQUIRED")
    const attempt = await createYouTubeOwnerAttempt({ email: token.email, providerSubject: token.sub })
    const response = NextResponse.json({ ok: true })
    response.headers.set("Cache-Control", "no-store")
    response.cookies.set(YOUTUBE_OWNER_ATTEMPT_COOKIE, attempt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: YOUTUBE_OWNER_ATTEMPT_TTL,
    })
    return response
  } catch {
    return NextResponse.json({ ok: false, code: "YOUTUBE_OWNER_ATTEMPT_UNAVAILABLE" }, { status: 503 })
  }
}
