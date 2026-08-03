export interface AgentDeployment {
  id: string
  agentId: string
  agentName: string
  agentType: string
  name: string
  status: "active" | "inactive" | "deploying" | "error"
  config: DeploymentConfig
  embedCode: string
  webhookUrl: string
  analytics: DeploymentAnalytics
  createdAt: Date
  updatedAt: Date
}

export interface DeploymentConfig {
  position: "bottom-right" | "bottom-left" | "top-right" | "top-left" | "center" | "inline"
  theme: "light" | "dark" | "auto" | "custom"
  size: "small" | "medium" | "large"
  autoOpen: boolean
  greeting: string
  placeholder: string
  primaryColor: string
  backgroundColor: string
  textColor: string
  borderRadius: number
  showBranding: boolean
  allowedDomains: string[]
  rateLimiting: {
    enabled: boolean
    maxMessages: number
    timeWindow: number
  }
  customCSS?: string
}

export interface DeploymentAnalytics {
  totalInteractions: number
  uniqueVisitors: number
  averageSessionLength: number
  conversionRate: number
  topPages: Array<{ page: string; interactions: number }>
  userSatisfaction: number
  responseTime: number
}

export const DEFAULT_DEPLOYMENT_CONFIG: DeploymentConfig = {
  position: "bottom-right",
  theme: "dark",
  size: "medium",
  autoOpen: false,
  greeting: "Hi! How can I help you today?",
  placeholder: "Type your message...",
  primaryColor: "#2563eb",
  backgroundColor: "#0f172a",
  textColor: "#f8fafc",
  borderRadius: 12,
  showBranding: true,
  allowedDomains: [],
  rateLimiting: {
    enabled: true,
    maxMessages: 50,
    timeWindow: 3600,
  },
}

/**
 * Temporary read-only deployment facade.
 *
 * The previous implementation initialized fake production deployments in an
 * in-memory Map and generated embed scripts for them. That behavior has been
 * removed. Real deployments must be backed by authenticated, tenant-scoped,
 * persistent storage before mutation or embed generation is enabled.
 */
export class DeploymentManager {
  getAllDeployments(): AgentDeployment[] {
    return []
  }

  getDeployment(_id: string): AgentDeployment | undefined {
    return undefined
  }

  createDeployment(): never {
    throw new Error("DEPLOYMENT_STORE_NOT_CONFIGURED")
  }

  updateDeployment(): null {
    return null
  }

  deleteDeployment(): false {
    return false
  }

  generateEmbedScript(): never {
    throw new Error("DEPLOYMENT_STORE_NOT_CONFIGURED")
  }
}

export const deploymentManager = new DeploymentManager()
