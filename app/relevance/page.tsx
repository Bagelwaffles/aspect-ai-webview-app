"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Brain, Plus, Play, Settings, TrendingUp, Workflow, Zap, Clock, CheckCircle, AlertCircle } from "lucide-react"
import type { RelevanceAgent, RelevanceWorkflow } from "@/lib/relevance"

export default function RelevancePage() {
  const [agents, setAgents] = useState<RelevanceAgent[]>([])
  const [workflows, setWorkflows] = useState<RelevanceWorkflow[]>([])
  const [isCreateAgentOpen, setIsCreateAgentOpen] = useState(false)
  const [isCreateWorkflowOpen, setIsCreateWorkflowOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [agentsResponse, workflowsResponse] = await Promise.all([
        fetch("/api/relevance/agents"),
        fetch("/api/relevance/workflows"),
      ])

      const agentsData = await agentsResponse.json()
      const workflowsData = await workflowsResponse.json()

      setAgents(agentsData.agents || [])
      setWorkflows(workflowsData.workflows || [])
    } catch (error) {
      console.error("Failed to fetch Relevance data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const runAgent = async (agentId: string, input: Record<string, any>) => {
    try {
      const response = await fetch(`/api/relevance/agents/${agentId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      })

      const data = await response.json()
      console.log("Agent result:", data.result)
    } catch (error) {
      console.error("Failed to run agent:", error)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "inactive":
        return <AlertCircle className="h-4 w-4 text-gray-500" />
      case "training":
        return <Clock className="h-4 w-4 text-yellow-500" />
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />
    }
  }

  const totalRuns = agents.reduce((sum, agent) => sum + agent.metrics.totalRuns, 0)
  const averageSuccessRate =
    agents.length > 0 ? agents.reduce((sum, agent) => sum + agent.metrics.successRate, 0) / agents.length : 0

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
                <Brain className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold font-serif">Relevance AI</h1>
                <p className="text-sm text-muted-foreground">Advanced AI agent platform</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={isCreateAgentOpen} onOpenChange={setIsCreateAgentOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Agent
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Relevance AI Agent</DialogTitle>
                  <DialogDescription>Configure a new AI agent with advanced capabilities</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="agent-name">Agent Name</Label>
                    <Input id="agent-name" placeholder="Enter agent name" />
                  </div>
                  <div>
                    <Label htmlFor="agent-description">Description</Label>
                    <Textarea id="agent-description" placeholder="Describe the agent's purpose" />
                  </div>
                  <Button className="w-full">Create Agent</Button>
                </div>
              </DialogContent>
            </Dialog>
            <Button variant="outline" onClick={() => (window.location.href = "/")}>
              Dashboard
            </Button>
          </div>
        </div>
      </header>

      <div className="p-6">
        {/* Overview Stats */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Agents</CardTitle>
              <Brain className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {agents.filter((a) => a.status === "active").length}
              </div>
              <p className="text-xs text-muted-foreground">{agents.length} total agents</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Runs</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{totalRuns.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Across all agents</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{averageSuccessRate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">Average performance</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Workflows</CardTitle>
              <Workflow className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{workflows.length}</div>
              <p className="text-xs text-muted-foreground">Active workflows</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="agents" className="space-y-6">
          <TabsList>
            <TabsTrigger value="agents">AI Agents</TabsTrigger>
            <TabsTrigger value="workflows">Workflows</TabsTrigger>
          </TabsList>

          <TabsContent value="agents" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {agents.map((agent) => (
                <Card key={agent.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Brain className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{agent.name}</CardTitle>
                          <CardDescription className="text-sm">{agent.description}</CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(agent.status)}
                        <Badge variant={agent.status === "active" ? "default" : "secondary"}>{agent.status}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-1">
                        {agent.capabilities.map((capability) => (
                          <Badge key={capability} variant="outline" className="text-xs">
                            {capability}
                          </Badge>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Total Runs</p>
                          <p className="font-medium">{agent.metrics.totalRuns.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Success Rate</p>
                          <p className="font-medium">{agent.metrics.successRate.toFixed(1)}%</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Avg Runtime</p>
                          <p className="font-medium">{agent.metrics.averageRunTime.toFixed(1)}s</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Model</p>
                          <p className="font-medium">{agent.model}</p>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => runAgent(agent.id, { test: true })} className="flex-1">
                          <Play className="h-3 w-3 mr-1" />
                          Run Test
                        </Button>
                        <Button size="sm" variant="outline">
                          <Settings className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="workflows" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {workflows.map((workflow) => (
                <Card key={workflow.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                          <Workflow className="h-5 w-5 text-accent" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{workflow.name}</CardTitle>
                          <CardDescription className="text-sm">{workflow.description}</CardDescription>
                        </div>
                      </div>
                      <Badge variant={workflow.status === "active" ? "default" : "secondary"}>{workflow.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">Triggers</p>
                        <div className="flex flex-wrap gap-1">
                          {workflow.triggers.map((trigger, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {trigger}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground">Steps: {workflow.steps?.length || 0}</p>
                      </div>

                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1">
                          <Play className="h-3 w-3 mr-1" />
                          Trigger
                        </Button>
                        <Button size="sm" variant="outline">
                          <Settings className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
