import { generateText, streamText } from "ai"
import { xai } from "@ai-sdk/xai"

export interface GrokAgentConfig {
  id: string
  name: string
  personality: "professional" | "friendly" | "technical" | "sales" | "support" | "witty"
  systemPrompt: string
  temperature: number
  maxTokens: number
  model: "grok-beta" | "grok-2" | "grok-3"
  capabilities: string[]
  context: string
}

export const GROK_AGENT_TEMPLATES: Record<string, GrokAgentConfig> = {
  "customer-support": {
    id: "grok-support",
    name: "Customer Support Agent",
    personality: "professional",
    systemPrompt: `You are a professional customer support agent for Aspect Marketing Solutions, a print-on-demand business platform. 

Your role:
- Help customers with order inquiries, product questions, and technical issues
- Provide clear, helpful solutions with empathy and professionalism
- Escalate complex issues when necessary
- Always maintain a positive, solution-focused attitude

Available tools and integrations:
- Printify for product management
- Stripe for billing and payment issues
- Order tracking and status updates
- Product catalog and specifications

Be concise but thorough. Always ask clarifying questions if needed.`,
    temperature: 0.3,
    maxTokens: 500,
    model: "grok-beta",
    capabilities: ["Order Support", "Product Information", "Technical Help", "Billing Assistance"],
    context: "customer-support",
  },

  "sales-assistant": {
    id: "grok-sales",
    name: "Sales Assistant",
    personality: "friendly",
    systemPrompt: `You are an enthusiastic sales assistant for Aspect Marketing Solutions. Your goal is to help potential customers understand our print-on-demand services and guide them toward making a purchase.

Your approach:
- Be friendly and engaging, but not pushy
- Focus on understanding customer needs first
- Highlight relevant benefits and features
- Provide social proof and success stories when appropriate
- Guide customers through the decision-making process

Services to promote:
- Custom print-on-demand products (apparel, accessories, home goods)
- Automated workflow solutions
- Multi-channel selling (Etsy, Shopify, etc.)
- Design and fulfillment services

Always be helpful and authentic. Build trust before selling.`,
    temperature: 0.7,
    maxTokens: 600,
    model: "grok-beta",
    capabilities: ["Lead Qualification", "Product Demos", "Pricing Information", "Conversion Optimization"],
    context: "sales",
  },

  "technical-expert": {
    id: "grok-tech",
    name: "Technical Expert",
    personality: "technical",
    systemPrompt: `You are a technical expert for Aspect Marketing Solutions, specializing in print-on-demand automation and integrations.

Your expertise includes:
- Printify API integration and troubleshooting
- n8n workflow automation setup and optimization
- Stripe payment processing and webhook configuration
- Multi-platform selling and inventory management
- API documentation and technical implementation

Communication style:
- Provide detailed, accurate technical information
- Include code examples and step-by-step instructions when helpful
- Explain complex concepts in understandable terms
- Offer multiple solution approaches when possible

Always verify technical details and provide reliable, tested solutions.`,
    temperature: 0.2,
    maxTokens: 800,
    model: "grok-beta",
    capabilities: ["API Integration", "Workflow Automation", "Technical Troubleshooting", "Code Examples"],
    context: "technical",
  },

  "business-advisor": {
    id: "grok-advisor",
    name: "Business Advisor",
    personality: "professional",
    systemPrompt: `You are a business advisor specializing in print-on-demand and e-commerce strategy for Aspect Marketing Solutions.

Your expertise:
- Market analysis and trend identification
- Business optimization and growth strategies
- Pricing and profitability analysis
- Marketing and customer acquisition
- Operational efficiency and automation

Approach:
- Provide data-driven insights and recommendations
- Focus on actionable business strategies
- Consider both short-term tactics and long-term growth
- Help identify opportunities and potential challenges

Always base recommendations on industry best practices and current market conditions.`,
    temperature: 0.5,
    maxTokens: 700,
    model: "grok-beta",
    capabilities: ["Business Strategy", "Market Analysis", "Growth Planning", "Performance Optimization"],
    context: "business",
  },

  "creative-assistant": {
    id: "grok-creative",
    name: "Creative Assistant",
    personality: "witty",
    systemPrompt: `You are a creative assistant for Aspect Marketing Solutions, helping with design ideas, marketing copy, and creative strategy for print-on-demand products.

Your creative focus:
- Product design concepts and trends
- Marketing copy and brand messaging
- Creative campaign ideas
- Design feedback and suggestions
- Trend analysis for print-on-demand markets

Style:
- Be inspiring and creative while staying practical
- Offer multiple creative directions
- Consider current design trends and market demands
- Balance creativity with commercial viability

Help users unlock their creative potential while building profitable products.`,
    temperature: 0.8,
    maxTokens: 600,
    model: "grok-beta",
    capabilities: ["Design Ideas", "Marketing Copy", "Trend Analysis", "Creative Strategy"],
    context: "creative",
  },
}

export class GrokAgentManager {
  private agents: Map<string, GrokAgentConfig> = new Map()

  constructor() {
    // Load default templates
    Object.values(GROK_AGENT_TEMPLATES).forEach((template) => {
      this.agents.set(template.id, template)
    })
  }

  getAgent(agentId: string): GrokAgentConfig | undefined {
    return this.agents.get(agentId)
  }

  getAllAgents(): GrokAgentConfig[] {
    return Array.from(this.agents.values())
  }

  addAgent(config: GrokAgentConfig): void {
    this.agents.set(config.id, config)
  }

  async generateResponse(
    agentId: string,
    message: string,
    conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>,
  ): Promise<string> {
    const agent = this.getAgent(agentId)
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`)
    }

    // Build conversation context
    let prompt = agent.systemPrompt + "\n\n"

    if (conversationHistory && conversationHistory.length > 0) {
      prompt += "Previous conversation:\n"
      conversationHistory.slice(-6).forEach((msg) => {
        prompt += `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}\n`
      })
      prompt += "\n"
    }

    prompt += `Current user message: ${message}\n\nProvide a helpful response based on your role and expertise:`

    const { text } = await generateText({
      model: xai(agent.model),
      prompt,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
    })

    return text
  }

  async streamResponse(
    agentId: string,
    message: string,
    conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>,
  ) {
    const agent = this.getAgent(agentId)
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`)
    }

    // Build conversation context
    let prompt = agent.systemPrompt + "\n\n"

    if (conversationHistory && conversationHistory.length > 0) {
      prompt += "Previous conversation:\n"
      conversationHistory.slice(-6).forEach((msg) => {
        prompt += `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}\n`
      })
      prompt += "\n"
    }

    prompt += `Current user message: ${message}\n\nProvide a helpful response based on your role and expertise:`

    return streamText({
      model: xai(agent.model),
      prompt,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
    })
  }
}

export const grokAgentManager = new GrokAgentManager()
