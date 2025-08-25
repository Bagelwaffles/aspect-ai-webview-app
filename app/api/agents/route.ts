import type { NextRequest } from "next/server"

export const runtime = "nodejs"

// Mock agent data - in production this would come from a database
const agents = [
  {
    id: "1",
    name: "Customer Service Pro",
    type: "customer-service",
    status: "active",
    description: "Handles customer inquiries and support requests",
    capabilities: ["Order tracking", "Product information", "Issue resolution"],
    model: "grok",
    config: {
      systemPrompt: "You are a helpful customer service agent...",
      temperature: 0.7,
      maxTokens: 500,
      responseFormat: "text",
      integrations: ["stripe", "printify"],
      triggers: [{ type: "keyword", value: "help" }],
      personality: "professional",
    },
    metrics: {
      totalInteractions: 1247,
      successRate: 94.2,
      averageResponseTime: 1.8,
      userSatisfaction: 4.6,
      conversionsGenerated: 23,
      revenueAttributed: 12450,
    },
    createdAt: new Date("2024-01-15"),
    updatedAt: new Date(),
  },
  {
    id: "2",
    name: "Sales Assistant AI",
    type: "sales",
    status: "active",
    description: "Qualifies leads and drives conversions",
    capabilities: ["Lead qualification", "Product recommendations", "Demo scheduling"],
    model: "relevance",
    config: {
      systemPrompt: "You are a sales assistant...",
      temperature: 0.8,
      maxTokens: 400,
      responseFormat: "text",
      integrations: ["stripe", "n8n"],
      triggers: [{ type: "intent", value: "purchase_intent" }],
      personality: "sales",
    },
    metrics: {
      totalInteractions: 892,
      successRate: 87.3,
      averageResponseTime: 2.1,
      userSatisfaction: 4.4,
      conversionsGenerated: 67,
      revenueAttributed: 34200,
    },
    createdAt: new Date("2024-01-20"),
    updatedAt: new Date(),
  },
]

export async function GET() {
  return Response.json({ agents })
}

export async function POST(req: NextRequest) {
  try {
    const agentData = await req.json()

    const newAgent = {
      id: Date.now().toString(),
      ...agentData,
      status: "training",
      metrics: {
        totalInteractions: 0,
        successRate: 0,
        averageResponseTime: 0,
        userSatisfaction: 0,
        conversionsGenerated: 0,
        revenueAttributed: 0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    agents.push(newAgent)

    return Response.json({ agent: newAgent }, { status: 201 })
  } catch (error) {
    return Response.json({ error: "Failed to create agent" }, { status: 500 })
  }
}
