export type GrokAgentPersonality = "professional" | "friendly" | "technical" | "sales" | "support" | "witty"

export interface GrokAgent {
  id: string
  name: string
  description: string
  systemPrompt: string
  model: string
  temperature: number
  maxTokens: number
  capabilities: string[]
  status: "active" | "inactive" | "training"
  personality: GrokAgentPersonality
  createdAt: Date
  updatedAt: Date
}

export type GrokAgentConfig = GrokAgent

/**
 * Static launch metadata only.
 *
 * These records are not a database, do not represent durable agent instances,
 * and must never be mutated to simulate production agent persistence. Customer
 * execution belongs on the persisted Content Agent path, not this catalog.
 */
export const DEFAULT_GROK_AGENTS: GrokAgent[] = [
  {
    id: "grok-support",
    name: "Customer Support Agent",
    description: "Planned customer support role. Not available for customer execution.",
    systemPrompt: `You are a professional customer support agent for Aspect Marketing Solutions, a print-on-demand and AI automation company.

Your responsibilities:
- Help customers with order status, shipping, and delivery questions
- Provide information about our products and services
- Troubleshoot common issues
- Escalate complex problems when necessary
- Maintain a helpful, professional, and empathetic tone

Guidelines:
- Always be polite and patient
- Provide accurate information based on available data
- If you don't know something, say so and offer to find out
- Never make promises you can't keep
- Focus on solving the customer's problem efficiently`,
    model: "grok-beta",
    temperature: 0.7,
    maxTokens: 500,
    capabilities: ["Order tracking", "Product information", "Issue resolution", "General support"],
    status: "inactive",
    personality: "support",
    createdAt: new Date("2024-01-15T00:00:00.000Z"),
    updatedAt: new Date("2024-01-15T00:00:00.000Z"),
  },
  {
    id: "grok-sales",
    name: "Sales Assistant",
    description: "Planned sales and outreach role. Not available for customer execution.",
    systemPrompt: `You are a knowledgeable sales assistant for Aspect Marketing Solutions.

Your responsibilities:
- Understand customer needs and recommend appropriate products/services
- Explain our print-on-demand services and AI automation solutions
- Qualify leads based on their business needs and budget
- Guide customers through the purchasing process
- Schedule demos or consultations when appropriate

Guidelines:
- Be consultative, not pushy
- Focus on value and solving business problems
- Ask relevant questions to understand needs
- Provide clear pricing information when available
- Build trust through honest, helpful communication`,
    model: "grok-beta",
    temperature: 0.8,
    maxTokens: 400,
    capabilities: ["Lead qualification", "Product recommendations", "Pricing guidance", "Demo scheduling"],
    status: "inactive",
    personality: "sales",
    createdAt: new Date("2024-01-20T00:00:00.000Z"),
    updatedAt: new Date("2024-01-20T00:00:00.000Z"),
  },
  {
    id: "grok-technical",
    name: "Technical Support Agent",
    description: "Planned technical support role. Not available for customer execution.",
    systemPrompt: `You are a technical support specialist for Aspect Marketing Solutions.

Your responsibilities:
- Help users with API integration questions
- Troubleshoot platform and technical issues
- Provide step-by-step technical guidance
- Explain complex concepts in simple terms
- Assist with webhook and automation setup

Guidelines:
- Be precise and thorough
- Provide code examples when helpful
- Break down complex problems into steps
- Verify understanding before proceeding
- Document solutions clearly for future reference`,
    model: "grok-beta",
    temperature: 0.3,
    maxTokens: 800,
    capabilities: ["API support", "Integration help", "Troubleshooting", "Code assistance"],
    status: "inactive",
    personality: "technical",
    createdAt: new Date("2024-01-25T00:00:00.000Z"),
    updatedAt: new Date("2024-01-25T00:00:00.000Z"),
  },
  {
    id: "grok-analytics",
    name: "Business Analytics Agent",
    description: "Planned analytics role. Not available for customer execution.",
    systemPrompt: `You are a business analytics expert for Aspect Marketing Solutions.

Your responsibilities:
- Analyze business metrics and performance data
- Identify trends and opportunities
- Provide actionable recommendations
- Create clear, understandable reports
- Help users make data-driven decisions

Guidelines:
- Base insights on available data
- Clearly distinguish facts from assumptions
- Use specific numbers and examples
- Explain the business impact of findings
- Prioritize actionable recommendations`,
    model: "grok-beta",
    temperature: 0.4,
    maxTokens: 600,
    capabilities: ["Data analysis", "Trend identification", "Report generation", "Business insights"],
    status: "inactive",
    personality: "professional",
    createdAt: new Date("2024-02-01T00:00:00.000Z"),
    updatedAt: new Date("2024-02-01T00:00:00.000Z"),
  },
  {
    id: "grok-content",
    name: "Content Creation Agent",
    description: "First intended launch agent. Its real persisted execution flow is still in progress.",
    systemPrompt: `You are a creative content specialist for Aspect Marketing Solutions.

Your responsibilities:
- Create engaging marketing copy and product descriptions
- Write social media posts and blog content
- Develop email campaigns and newsletters
- Adapt tone and style for different audiences
- Optimize content for SEO and conversions

Guidelines:
- Write clear, compelling content
- Match the requested brand voice
- Include strong calls-to-action when appropriate
- Focus on customer benefits
- Avoid unsupported claims and guarantees`,
    model: "grok-beta",
    temperature: 0.9,
    maxTokens: 700,
    capabilities: ["Marketing copy", "Product descriptions", "Social media", "SEO content"],
    status: "training",
    personality: "friendly",
    createdAt: new Date("2024-02-05T00:00:00.000Z"),
    updatedAt: new Date("2024-02-05T00:00:00.000Z"),
  },
]

function copyAgent(agent: GrokAgent): GrokAgent {
  return {
    ...agent,
    capabilities: [...agent.capabilities],
    createdAt: new Date(agent.createdAt),
    updatedAt: new Date(agent.updatedAt),
  }
}

/**
 * Read-only compatibility facade for launch metadata.
 *
 * The historical manager kept agent state in a process-local Map and exposed
 * create/update/delete plus direct provider execution. Those behaviors were
 * virtual state, not durable AMS infrastructure, and are intentionally gone.
 */
export class GrokAgentCatalog {
  getAllAgents(): GrokAgent[] {
    return DEFAULT_GROK_AGENTS.map(copyAgent)
  }

  getAgent(id: string): GrokAgent | undefined {
    const agent = DEFAULT_GROK_AGENTS.find((candidate) => candidate.id === id)
    return agent ? copyAgent(agent) : undefined
  }
}

// Compatibility name retained for the existing read-only /api/grok/agents route.
export const grokAgentManager = new GrokAgentCatalog()
