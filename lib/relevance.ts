interface RelevanceAgent {
  id: string
  name: string
  description: string
  status: "active" | "inactive" | "training"
  model: string
  capabilities: string[]
  metrics: {
    totalRuns: number
    successRate: number
    averageRunTime: number
    lastRun: Date | null
  }
}

interface RelevanceWorkflow {
  id: string
  name: string
  description: string
  triggers: string[]
  steps: RelevanceWorkflowStep[]
  status: "active" | "inactive"
}

interface RelevanceWorkflowStep {
  id: string
  type: "llm" | "api" | "condition" | "transform"
  name: string
  config: Record<string, any>
}

class RelevanceClient {
  private apiKey: string
  private authToken: string
  private region: string
  private projectId: string
  private baseUrl: string

  constructor() {
    this.apiKey = process.env.RELEVANCE_API_KEY!
    this.authToken = process.env.RELEVANCE_AUTH_TOKEN!
    this.region = process.env.RELEVANCE_REGION!
    this.projectId = process.env.RELEVANCE_PROJECT_ID!
    this.baseUrl = process.env.RELEVANCE_AGENT_API_URL!
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${endpoint}`

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.authToken}`,
        "X-API-Key": this.apiKey,
        "Content-Type": "application/json",
        "X-Region": this.region,
        "X-Project-ID": this.projectId,
        ...options.headers,
      },
    })

    if (!response.ok) {
      throw new Error(`Relevance API error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  async getAgents(): Promise<RelevanceAgent[]> {
    try {
      const data = await this.makeRequest("/agents")
      return data.agents || []
    } catch (error) {
      console.error("Failed to fetch Relevance agents:", error)
      // Return mock data for development
      return [
        {
          id: "rel-1",
          name: "Content Generator",
          description: "Generates marketing content and product descriptions",
          status: "active",
          model: "gpt-4",
          capabilities: ["Content Generation", "SEO Optimization", "Brand Voice"],
          metrics: {
            totalRuns: 1543,
            successRate: 96.8,
            averageRunTime: 2.3,
            lastRun: new Date(),
          },
        },
        {
          id: "rel-2",
          name: "Lead Qualifier",
          description: "Qualifies and scores incoming leads",
          status: "active",
          model: "gpt-3.5-turbo",
          capabilities: ["Lead Scoring", "Intent Analysis", "CRM Integration"],
          metrics: {
            totalRuns: 892,
            successRate: 94.2,
            averageRunTime: 1.8,
            lastRun: new Date(),
          },
        },
      ]
    }
  }

  async createAgent(agentData: Partial<RelevanceAgent>): Promise<RelevanceAgent> {
    try {
      const data = await this.makeRequest("/agents", {
        method: "POST",
        body: JSON.stringify(agentData),
      })
      return data.agent
    } catch (error) {
      console.error("Failed to create Relevance agent:", error)
      throw error
    }
  }

  async runAgent(agentId: string, input: Record<string, any>): Promise<any> {
    try {
      const data = await this.makeRequest(`/agents/${agentId}/run`, {
        method: "POST",
        body: JSON.stringify({ input }),
      })
      return data.result
    } catch (error) {
      console.error("Failed to run Relevance agent:", error)
      throw error
    }
  }

  async getWorkflows(): Promise<RelevanceWorkflow[]> {
    try {
      const data = await this.makeRequest("/workflows")
      return data.workflows || []
    } catch (error) {
      console.error("Failed to fetch Relevance workflows:", error)
      return []
    }
  }

  async createWorkflow(workflowData: Partial<RelevanceWorkflow>): Promise<RelevanceWorkflow> {
    try {
      const data = await this.makeRequest("/workflows", {
        method: "POST",
        body: JSON.stringify(workflowData),
      })
      return data.workflow
    } catch (error) {
      console.error("Failed to create Relevance workflow:", error)
      throw error
    }
  }

  async triggerWorkflow(workflowId: string, payload: Record<string, any>): Promise<any> {
    try {
      const data = await this.makeRequest(`/workflows/${workflowId}/trigger`, {
        method: "POST",
        body: JSON.stringify(payload),
      })
      return data.result
    } catch (error) {
      console.error("Failed to trigger Relevance workflow:", error)
      throw error
    }
  }
}

export const relevanceClient = new RelevanceClient()
export type { RelevanceAgent, RelevanceWorkflow, RelevanceWorkflowStep }
