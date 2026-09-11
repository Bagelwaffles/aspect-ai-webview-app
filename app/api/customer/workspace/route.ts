import { NextRequest, NextResponse } from "next/server"

import { authorizeCustomerApiRequest } from "@/lib/server/customer-api-auth"
import {
  customerWorkspaceProfileSchema,
  getCustomerWorkspaceProfile,
  listCustomerAssets,
  saveCustomerWorkspaceProfile,
} from "@/lib/server/customer-workspace"
import { isLiveResearchConfigured } from "@/lib/server/live-research"
import { isR2AssetStorageConfigured } from "@/lib/server/r2-presign"
import { requestHasTrustedAppOrigin } from "@/lib/server/request-origin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function GET(request: NextRequest) {
  const principal = await authorizeCustomerApiRequest(request)
  if (!principal || principal.kind !== "customer") {
    return json({ ok: false, code: "CUSTOMER_SESSION_REQUIRED" }, 401)
  }

  try {
    const [profile, assets] = await Promise.all([
      getCustomerWorkspaceProfile(principal.subject),
      listCustomerAssets(principal.subject),
    ])

    return json({
      ok: true,
      workspace: {
        profile,
        assets,
        capabilities: {
          assetStorage: isR2AssetStorageConfigured(),
          liveResearch: isLiveResearchConfigured(),
          externalConnections: false,
        },
      },
    })
  } catch {
    return json(
      { ok: false, code: "WORKSPACE_UNAVAILABLE", error: "Customer workspace is unavailable" },
      503,
    )
  }
}

export async function PATCH(request: NextRequest) {
  if (!requestHasTrustedAppOrigin(request)) {
    return json({ ok: false, code: "UNTRUSTED_ORIGIN" }, 403)
  }

  const principal = await authorizeCustomerApiRequest(request)
  if (!principal || principal.kind !== "customer") {
    return json({ ok: false, code: "CUSTOMER_SESSION_REQUIRED" }, 401)
  }

  const body = await request.json().catch(() => null)
  const parsed = customerWorkspaceProfileSchema.safeParse(body)
  if (!parsed.success) {
    return json(
      {
        ok: false,
        code: "INVALID_WORKSPACE_PROFILE",
        error: "Workspace profile values were not accepted",
      },
      400,
    )
  }

  try {
    const profile = await saveCustomerWorkspaceProfile(principal.subject, parsed.data)
    return json({ ok: true, profile })
  } catch {
    return json(
      { ok: false, code: "WORKSPACE_UNAVAILABLE", error: "Customer workspace is unavailable" },
      503,
    )
  }
}
