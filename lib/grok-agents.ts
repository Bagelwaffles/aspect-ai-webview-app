import { xai } from "@ai-sdk/xai"
import { generateText, streamText } from "ai"

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

export const DEFAULT_GROK_AGENTS: GrokAgent[] = [
  {
    id: "grok-support",
    name: "Customer Support Agent",
    description: "Handles customer inquiries, order status, and support requests with empathy and efficiency",
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
    status: "active",
    personality: "support",
    createdAt: new Date("2024-01-15"),
    updatedAt: new Date(),
  },
  {
    id: "grok-sales",
    name: "Sales Assistant",
    description: "Qualifies leads, provides product recommendations, and guides customers toward purchases",
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
    status: "active",
    personality: "sales",
    createdAt: new Date("2024-01-20"),
    updatedAt: new Date(),
  },
  {
    id: "grok-technical",
    name: "Technical Support Agent",
    description: "Provides technical assistance for APIs, integrations, and platform issues",
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
    status: "active",
    personality: "technical",
    createdAt: new Date("2024-01-25"),
    updatedAt: new Date(),
  },
  {
    id: "grok-analytics",
    name: "Business Analytics Agent",
    description: "Analyzes business data and provides actionable insights and recommendations",
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
    status: "active",
    personality: "professional",
    createdAt: new Date("2024-02-01"),
    updatedAt: new Date(),
  },
  {
    id: "grok-content",
    name: "Content Creation Agent",
    description: "Creates engaging marketing content, product descriptions, and social media posts",
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
    status: "active",
    personality: "friendly",
    createdAt: new Date("2024-02-05"),
    updatedAt: new Date(),
  },
]

export class GrokAgentManager {
  private agents = new Map<string, GrokAgent>()

  constructor() {
    DEFAULT_GROK_AGENTS.forEach((agent) => this.agents.set(agent.id, agent))
  }

  getAllAgents(): GrokAgent[] {
    return Array.from(this.agents.values())
  }

  getAgent(id: string): GrokAgent | undefined {
    return this.agents.get(id)
  }

  createAgent(agentData: Omit<GrokAgent, "id" | "createdAt" | "updatedAt">): GrokAgent {
    const agent: GrokAgent = {
      ...agentData,
      id: `grok-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    this.agents.set(agent.id, agent)
    return agent
  }

  updateAgent(id: string, updates: Partial<GrokAgent>): GrokAgent | null {
    const agent = this.agents.get(id)
    if (!agent) return null
    const updated = { ...agent, ...updates, updatedAt: new Date() }
    this.agents.set(id, updated)
    return updated
  }

  deleteAgent(id: string): boolean {
    return this.agents.delete(id)
  }

  async generateResponse(
    agentId: string,
    message: string,
    conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>,
  ): Promise<string> {
    const agent = this.getAgent(agentId)
    if (!agent) throw new Error(`Agent ${agentId} not found`)

    let prompt = `${agent.systemPrompt}\n\n`
    if (conversationHistory?.length) {
      prompt += "Previous conversation:\n"
      conversationHistory.slice(-6).forEach((entry) => {
        prompt += `${entry.role === "user" ? "User" : "Assistant"}: ${entry.content}\n`
      })
      prompt += "\n"
    }
    prompt += `Current user message: ${message}\n\nProvide a helpful response based on your role and expertise:`

    const { text } = await generateText({
      model: xai(agent.model),
      prompt,
      temperature: agent.temperature,
      maxOutputTokens: agent.maxTokens,
    })
    return text
  }

  async streamResponse(
    agentId: string,
    message: string,
    conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>,
  ) {
    const agent = this.getAgent(agentId)
    if (!agent) throw new Error(`Agent ${agentId} not found`)

    let prompt = `${agent.systemPrompt}\n\n`
    if (conversationHistory?.length) {
      prompt += "Previous conversation:\n"
      conversationHistory.slice(-6).forEach((entry) => {
        prompt += `${entry.role === "user" ? "User" : "Assistant"}: ${entry.content}\n`
      })
      prompt += "\n"
    }
    prompt += `Current user message: ${message}\n\nProvide a helpful response based on your role and expertise:`

    return streamText({
      model: xai(agent.model),
      prompt,
      temperature: agent.temperature,
      maxOutputTokens: agent.maxTokens,
    })
  }
}

export const grokAgentManager = new GrokAgentManager()
