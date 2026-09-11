import type { NextRequest } from "next/server"

import {
  authorizeCustomerApiRequest,
  type CustomerApiPrincipal,
} from "@/lib/server/customer-api-auth"
import { requestHasTrustedAppOrigin } from "@/lib/server/request-origin"

export type OwnerAuthorizationResult =
  | { ok: true; principal: CustomerApiPrincipal }
  | { ok: false; status: 401 | 403; code: "OWNER_SESSION_REQUIRED" | "UNTRUSTED_ORIGIN" }

function configuredOwnerEmail(env: NodeJS.ProcessEnv = process.env) {
  return env.AMS_OWNER_EMAIL?.trim().toLowerCase() ?? ""
}

export async function authorizeOwnerApiRequest(
  request: NextRequest,
  options: { requireTrustedOrigin?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<OwnerAuthorizationResult> {
  const env = options.env ?? process.env
  if (options.requireTrustedOrigin && !requestHasTrustedAppOrigin(request, env)) {
    return { ok: false, status: 403, code: "UNTRUSTED_ORIGIN" }
  }

  const principal = await authorizeCustomerApiRequest(request)
  const ownerEmail = configuredOwnerEmail(env)
  if (!principal || !ownerEmail || principal.billingEmail !== ownerEmail) {
    return { ok: false, status: 401, code: "OWNER_SESSION_REQUIRED" }
  }

  return { ok: true, principal }
}
