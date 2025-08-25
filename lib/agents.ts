export interface Agent {
  id: string
  name: string
  type: "chat" | "workflow" | "analytics" | "customer-service" | "sales"
  status: "active" | "inactive" | "training" | "error"
  description: string
  capabilities: string[]
  model: "grok" | "relevance" | "custom"
  config: AgentConfig
  metrics: AgentMetrics
  createdAt: Date
  updatedAt: Date
}

export interface AgentConfig {
  systemPrompt: string
  temperature: number
  maxTokens: number
  responseFormat: "text" | "json" | "structured"
  integrations: string[]
  triggers: AgentTrigger[]
  personality: "professional" | "friendly" | "technical" | "sales" | "support"
}

export interface AgentTrigger {
  type: "keyword" | "intent" | "schedule" | "webhook" | "user-action"
  value: string
  conditions?: Record<string, any>
}

export interface AgentMetrics {
  totalInteractions: number
  successRate: number
  averageResponseTime: number
  userSatisfaction: number
  conversionsGenerated: number
  revenueAttributed: number
}

export const AGENT_TEMPLATES = {
  "customer-service": {
    name: "Customer Service Agent",
    description: "Handles customer inquiries, order status, and support requests",
    systemPrompt:
      "You are a helpful customer service agent for Aspect Marketing Solutions. Assist customers with orders, product questions, and general support. Be professional, empathetic, and solution-focused.",
    capabilities: ["Order tracking", "Product information", "Issue resolution", "Escalation handling"],
    personality: "professional" as const,
  },
  sales: {
    name: "Sales Assistant",
    description: "Qualifies leads, provides product recommendations, and drives conversions",
    systemPrompt:
      "You are a sales assistant for Aspect Marketing Solutions. Help visitors understand our print-on-demand services, qualify leads, and guide them toward making a purchase. Be persuasive but not pushy.",
    capabilities: ["Lead qualification", "Product recommendations", "Pricing information", "Demo scheduling"],
    personality: "sales" as const,
  },
  technical: {
    name: "Technical Support Agent",
    description: "Provides technical assistance and troubleshooting for platform issues",
    systemPrompt:
      "You are a technical support specialist for Aspect Marketing Solutions. Help users with platform issues, API questions, and integration problems. Provide clear, step-by-step solutions.",
    capabilities: ["API support", "Integration help", "Troubleshooting", "Documentation guidance"],
    personality: "technical" as const,
  },
  analytics: {
    name: "Analytics Agent",
    description: "Provides business insights, reports, and data analysis",
    systemPrompt:
      "You are a business analytics expert for Aspect Marketing Solutions. Analyze data, provide insights, and help users understand their business metrics and opportunities for growth.",
    capabilities: ["Data analysis", "Report generation", "Trend identification", "Performance insights"],
    personality: "professional" as const,
  },
} as const
