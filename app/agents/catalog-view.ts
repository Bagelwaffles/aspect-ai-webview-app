import { agents, type AgentStatus } from "./agentCatalog"

export function selectCatalogAgents(category: string, status: AgentStatus | "All", showRoadmap: boolean) {
  return agents.filter((agent) =>
    (category === "All" || agent.category === category) &&
    (status === "All" || agent.status === status) &&
    (showRoadmap || status !== "All" || agent.status === "live"),
  )
}
