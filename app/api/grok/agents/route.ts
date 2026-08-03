import { NextRequest, NextResponse } from "next/server"

import { grokAgentManager } from "@/lib/grok-agents"
import { authorizePaidApiRequest } from "@/lib/server/customer-api-auth"
import {
  agentSlugForRuntimeAgent,
  getEntitlementSnapshot,
  snapshotHasAgentAccess,
} from "@/lib/server/entitlements"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const principal = await authorizePaidApiRequest(request)
  if (!principal) {
    return NextResponse.json(
      { ok: false, error: "Authentication required", code: "CUSTOMER_AUTH_REQUIRED" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    )
  }

  const snapshot =
    principal.kind === "customer"
      ? await getEntitlementSnapshot(principal.email).catch(() => null)
      : null

  if (principal.kind === "customer" && !snapshot?.configured) {
    return NextResponse.json(
      { ok: false, error: "Entitlement service is not configured", code: "ENTITLEMENTS_NOT_CONFIGURED" },
      { status: 503 },
    )
  }

  const agents = grokAgentManager
    .getAllAgents()
    .map((agent) => ({ agent, slug: agentSlugForRuntimeAgent(agent.id) }))
    .filter((entry): entry is { agent: ReturnType<typeof grokAgentManager.getAllAgents>[number]; slug: string } => Boolean(entry.slug))
    .map(({ agent, slug }) => ({
      id: agent.id,
      slug,
      name: agent.name,
      description: agent.description,
      model: process.env.XAI_MODEL?.trim() ?? "not_configured",
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      capabilities: agent.capabilities,
      status: agent.status,
      personality: agent.personality,
      entitled: principal.kind === "internal" || Boolean(snapshot && snapshotHasAgentAccess(snapshot, slug)),
    }))

  return NextResponse.json(
    {
      ok: true,
      agents,
      account:
        principal.kind === "customer" && snapshot
          ? {
              plan: snapshot.plan,
              subscriptionStatus: snapshot.subscriptionStatus,
              creditsRemaining: snapshot.totalCredits,
            }
          : { internal: true },
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
