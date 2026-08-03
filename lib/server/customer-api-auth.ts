import { getServerSession } from "next-auth"
import type { NextRequest } from "next/server"

import { authOptions, isCustomerAuthConfigured } from "@/lib/auth"
import { isInternalApiAuthorized } from "@/lib/server/internal-api-auth"

export type PaidApiPrincipal =
  | { kind: "internal"; subject: string }
  | { kind: "customer"; subject: string; email: string }

export async function authorizePaidApiRequest(request: NextRequest): Promise<PaidApiPrincipal | null> {
  if (isInternalApiAuthorized(request)) {
    return { kind: "internal", subject: "internal-api" }
  }

  if (!isCustomerAuthConfigured()) {
    return null
  }

  try {
    const session = await getServerSession(authOptions)
    const email = session?.user?.email?.trim().toLowerCase()
    if (!email) return null

    return {
      kind: "customer",
      subject: `customer:${email}`,
      email,
    }
  } catch {
    return null
  }
}
