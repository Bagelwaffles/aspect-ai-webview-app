import { NextResponse } from "next/server"
import { agents, agentStatusCounts, statusMeta } from "../../agents/agentCatalog"

export const dynamic = "force-static"

export async function GET() {
  const body = {
    schema_version: "1.0",
    company: {
      name: "Aspect Marketing Solutions",
      short_name: "AMS",
      website: "https://www.aspectmarketingsolutions.app/",
      collaboration_page: "https://www.aspectmarketingsolutions.app/collaborate",
      contact_email: "kimberleyaversbiz@gmail.com",
      positioning:
        "AMS is building a coordinated AI operating layer for business growth using specialized agents, automation, controlled integrations, and human approval where higher-impact actions require it.",
    },
    public_offer: {
      name: "Quick Marketing Audit",
      price_usd: 49,
      billing: "one-time",
      subscription_required: false,
      target_delivery: "within 48 hours",
      summary:
        "A focused marketing review designed to identify five problems, five specific fixes, a stronger headline, a stronger offer, one ready-to-use promotional post, and a practical seven-day action plan.",
    },
    operating_principles: [
      "Proof over theater: catalog presence, prompts, keys, mockups, or workflow files do not equal production availability.",
      "One coordinated system with specialized business roles rather than one generic assistant.",
      "Human approval remains where public posting, payments, account changes, destructive operations, or unusual requests create meaningful risk.",
      "Start collaborations with one reversible, measurable pilot before broad customer promises or long-term commercial commitments.",
    ],
    collaboration_models: [
      "Pilot collaboration",
      "Co-branded service",
      "Referral relationship",
      "Technology or integration collaboration",
      "Content and distribution collaboration",
      "Research and product-development collaboration",
    ],
    collaboration_guardrails: [
      "Do not exchange passwords, API keys, payment secrets, private keys, recovery codes, or payment-card data in collaboration briefs.",
      "Use owner-authorized least-privilege integrations instead of shared credentials.",
      "Do not represent planned or setup-required agents as live customer functionality.",
      "Define scope, owners, approvals, data handling, success criteria, and commercial terms before client-facing work begins.",
      "Revenue share, referral fees, IP ownership, exclusivity, equity, legal partnership status, and customer ownership require separate explicit agreement.",
    ],
    architecture: [
      "Next.js web platform deployed through Vercel",
      "Protected server-side routes and authenticated product paths",
      "Stripe payment and entitlement flows",
      "n8n Cloud workflow orchestration",
      "Persistent state, usage controls, idempotency, rate limits, and explicit failure handling where required",
      "Separate Android release track for mobile distribution",
    ],
    agent_status_counts: agentStatusCounts,
    status_definitions: Object.fromEntries(
      Object.entries(statusMeta).map(([key, value]) => [key, { label: value.label, description: value.description }]),
    ),
    agents: agents.map((agent) => ({
      slug: agent.slug,
      name: agent.name,
      category: agent.category,
      status: agent.status,
      status_label: statusMeta[agent.status].label,
      description: agent.description,
      capabilities: agent.capabilities,
      status_reason: agent.statusReason,
      next_milestone: agent.nextMilestone,
      internal: Boolean(agent.internal),
    })),
    recommended_collaboration_process: [
      "Define one measurable business outcome.",
      "Assign what the collaborator owns, what AMS owns, what requires joint approval, and what is out of scope.",
      "Run a small reversible pilot using owner-authorized systems, test data, or AMS itself where possible.",
      "Review results against agreed success criteria before scaling or creating commercial terms.",
    ],
    legal_and_commercial_note:
      "This public profile is informational only. A collaboration discussion does not create a legal partnership, joint venture, employment relationship, exclusivity obligation, equity commitment, revenue share, or authorization to access systems or customer data.",
  }

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=86400",
    },
  })
}
