import { Redis } from "@upstash/redis"
import { NextRequest } from "next/server"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { handleOwnerDomainVerification } from "@/lib/server/quick-audit-resend-owner-verification"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 20

export async function POST(request: NextRequest) {
  return handleOwnerDomainVerification(request, {
    env: process.env,
    authorize: () => authorizeOwnerApiRequest(request, { requireTrustedOrigin: true }),
    redis: () => new Redis({
      url: process.env.AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL!,
      token: process.env.AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_TOKEN!,
    }),
  })
}

export async function GET(request: NextRequest) {
  return handleOwnerDomainVerification(request, {
    env: process.env,
    authorize: async () => ({ ok: false }),
    redis: () => { throw new Error("GET has no datastore access") },
  })
}
