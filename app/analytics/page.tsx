"use client"

import { useEffect, useMemo, useState } from "react"
import { BarChart3, DollarSign, Download, Package, ShoppingCart, TrendingDown, TrendingUp, Users } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type AgentRow = {
  id: string
  name: string
  status?: string
  metrics?: {
    totalInteractions?: number
    revenueAttributed?: number
    userSatisfaction?: number
  }
}

type DeploymentRow = {
  id: string
  name: string
  agentName?: string
  status?: string
  analytics?: {
    totalInteractions?: number
    uniqueVisitors?: number
    conversionRate?: number
  }
}

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState("12m")
  const [selectedShop, setSelectedShop] = useState("all")
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [deployments, setDeployments] = useState<DeploymentRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    Promise.all([
      fetch("/api/agents", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/deployments", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ]).then(([agentsData, deploymentsData]) => {
      if (!mounted) return
      setAgents(Array.isArray(agentsData?.agents) ? agentsData.agents : [])
      setDeployments(Array.isArray(deploymentsData?.deployments) ? deploymentsData.deployments : [])
      setLoading(false)
    })

    return () => {
      mounted = false
    }
  }, [])

  const totalRevenue = useMemo(
    () => agents.reduce((sum, agent) => sum + (agent.metrics?.revenueAttributed || 0), 0),
    [agents],
  )
  const totalOrders = useMemo(
    () => deployments.reduce((sum, deployment) => sum + (deployment.analytics?.totalInteractions || 0), 0),
    [deployments],
  )
  const avgOrderValue = useMemo(() => {
    if (!totalOrders) return 0
    return totalRevenue / totalOrders
  }, [totalOrders, totalRevenue])
  const conversionRate = useMemo(() => {
    if (!deployments.length) return 0
    return deployments.reduce((sum, deployment) => sum + (deployment.analytics?.conversionRate || 0), 0) / deployments.length
  }, [deployments])
  const activeAgents = agents.filter((agent) => agent.status === "active").length
  const activeDeployments = deployments.filter((deployment) => deployment.status === "active").length

  const liveAgentRows = useMemo(
    () =>
      agents.slice(0, 6).map((agent) => ({
        name: agent.name,
        interactions: agent.metrics?.totalInteractions || 0,
        revenue: agent.metrics?.revenueAttributed || 0,
        satisfaction: agent.metrics?.userSatisfaction || 0,
      })),
    [agents],
  )

  const liveDeploymentRows = useMemo(
    () =>
      deployments.slice(0, 6).map((deployment) => ({
        name: deployment.name,
        agentName: deployment.agentName || "Live deployment",
        interactions: deployment.analytics?.totalInteractions || 0,
        visitors: deployment.analytics?.uniqueVisitors || 0,
        conversion: deployment.analytics?.conversionRate || 0,
      })),
    [deployments],
  )

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <TrendingUp className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-card-foreground font-[family-name:var(--font-work-sans)]">
                Analytics & Insights
              </h1>
              <p className="text-sm text-muted-foreground">Live platform state from connected APIs</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="3m">Last 3 months</SelectItem>
                <SelectItem value="12m">Last 12 months</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="agents">Agents</TabsTrigger>
            <TabsTrigger value="deployments">Deployments</TabsTrigger>
            <TabsTrigger value="status">Status</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Live Revenue</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">{loading ? "Loading..." : `$${totalRevenue.toLocaleString()}`}</div>
                  <p className="text-xs text-muted-foreground">From connected agent metrics</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Live Orders / Interactions</CardTitle>
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">{loading ? "Loading..." : totalOrders.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">From connected deployments</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">{loading ? "Loading..." : `$${avgOrderValue.toFixed(2)}`}</div>
                  <p className="text-xs text-muted-foreground">Computed from live totals</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">{loading ? "Loading..." : `${conversionRate.toFixed(1)}%`}</div>
                  <p className="text-xs text-muted-foreground">Live deployment average</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-work-sans)]">Live Data Note</CardTitle>
                <CardDescription>
                  This page only shows connected API data. If a source is missing, we leave it blank instead of inventing analytics.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>Active agents: {activeAgents}</p>
                <p>Active deployments: {activeDeployments}</p>
                <p>Shop filter: {selectedShop}</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="agents" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Agent Performance</CardTitle>
                <CardDescription>Live agent metrics from the connected API</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {liveAgentRows.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No live agents are connected yet.</div>
                ) : (
                  liveAgentRows.map((agent) => (
                    <div key={agent.name} className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <p className="font-medium">{agent.name}</p>
                        <p className="text-sm text-muted-foreground">{agent.interactions} interactions</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">${agent.revenue.toLocaleString()}</p>
                        <p className="text-sm text-muted-foreground">{agent.satisfaction.toFixed(1)}/5 satisfaction</p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="deployments" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Live Deployments</CardTitle>
                <CardDescription>Connected deployment summaries from the live API</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {liveDeploymentRows.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                    No live deployments are connected yet.
                  </div>
                ) : (
                  liveDeploymentRows.map((deployment) => (
                    <div key={deployment.name} className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <p className="font-medium">{deployment.name}</p>
                        <p className="text-sm text-muted-foreground">{deployment.agentName}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{deployment.interactions} interactions</p>
                        <p className="text-sm text-muted-foreground">{deployment.visitors} visitors, {deployment.conversion.toFixed(1)}% conversion</p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="status" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Live Status</CardTitle>
                <CardDescription>Production shows only what is actually connected.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>Agents endpoint: {loading ? "Loading..." : `${agents.length} records`}</p>
                <p>Deployments endpoint: {loading ? "Loading..." : `${deployments.length} records`}</p>
                <p>Analytics history: not yet persisted to a dedicated live analytics store.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
