import { NextRequest, NextResponse } from "next/server"

import { grokAgentManager, type GrokAgentConfig } from "@/lib/grok-agents"
import { authorizePaidApiRequest } from "@/lib/server/customer-api-auth"
import {
  getEntitlementSnapshot,
  snapshotHasAgentAccess,
} from "@/lib/server/entitlements"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type GrokAgentsDependencies = {
  authorize: typeof authorizePaidApiRequest
  getEntitlements: typeof getEntitlementSnapshot
  hasAgentAccess: typeof snapshotHasAgentAccess
  getAgents: () => GrokAgentConfig[]
  getProviderModel: () => string
}

type GrokAgentsTestGlobals = typeof globalThis & {
  __amsGrokAgentsTestDependencies?: Partial<GrokAgentsDependencies>
}

function testDependencies(): Partial<GrokAgentsDependencies> {
  if (process.env.NODE_ENV === "production") return {}
  return (globalThis as GrokAgentsTestGlobals).__amsGrokAgentsTestDependencies ?? {}
}

function createGrokAgentsHandler(overrides: Partial<GrokAgentsDependencies> = {}) {
  const dependencies: GrokAgentsDependencies = {
    authorize: authorizePaidApiRequest,
    getEntitlements: getEntitlementSnapshot,
    hasAgentAccess: snapshotHasAgentAccess,
    getAgents: () => grokAgentManager.getAllAgents(),
    getProviderModel: () => process.env.XAI_MODEL?.trim() ?? "not_configured",
    ...overrides,
  }

  return async function GET(request: NextRequest) {
    const principal = await dependencies.authorize(request)
    if (!principal || principal.kind !== "customer") {
      return NextResponse.json(
        { ok: false, error: "A customer session is required", code: "CUSTOMER_SESSION_REQUIRED" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      )
    }

    const snapshot = await dependencies.getEntitlements(principal.subject).catch(() => null)
    if (!snapshot?.configured) {
      return NextResponse.json(
        { ok: false, error: "Entitlement service is not configured", code: "ENTITLEMENTS_NOT_CONFIGURED" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      )
    }

    const contentAgent = dependencies.getAgents().find((agent) => agent.id === "grok-content")
    const entitled = dependencies.hasAgentAccess(snapshot, "content")
    const agents = contentAgent
      ? [
          {
            id: contentAgent.id,
            slug: "content",
            name: contentAgent.name,
            description: contentAgent.description,
            model: dependencies.getProviderModel(),
            temperature: contentAgent.temperature,
            maxTokens: contentAgent.maxTokens,
            capabilities: contentAgent.capabilities,
            status: contentAgent.status,
            personality: contentAgent.personality,
            entitled,
            executionStatus: entitled ? "available" : "subscription_required",
          },
        ]
      : []

    return NextResponse.json(
      {
        ok: true,
        agents,
        account: {
          plan: snapshot.plan,
          subscriptionStatus: snapshot.subscriptionStatus,
          creditsRemaining: snapshot.totalCredits,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  }
}

export async function GET(request: NextRequest) {
  return createGrokAgentsHandler(testDependencies())(request)
}
