"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Bot, Plus, Settings, TrendingUp, MessageSquare, Globe, Play, Pause, DollarSign } from "lucide-react"
import { type Agent, AGENT_TEMPLATES } from "@/lib/agents"

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<keyof typeof AGENT_TEMPLATES>("customer-service")
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchAgents()
  }, [])

  const fetchAgents = async () => {
    try {
      const response = await fetch("/api/agents")
      const data = await response.json()
      setAgents(data.agents || [])
    } catch (error) {
      console.error("Failed to fetch agents:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const createAgent = async (agentData: Partial<Agent>) => {
    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agentData),
      })

      if (response.ok) {
        fetchAgents()
        setIsCreateDialogOpen(false)
      }
    } catch (error) {
      console.error("Failed to create agent:", error)
    }
  }

  const toggleAgentStatus = async (agentId: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active"

    try {
      await fetch(`/api/agents/${agentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })

      fetchAgents()
    } catch (error) {
      console.error("Failed to update agent status:", error)
    }
  }

  const deployAgent = async (agentId: string) => {
    try {
      const response = await fetch("/api/agents/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          deploymentConfig: {
            position: "bottom-right",
            theme: "light",
            autoOpen: false,
          },
        }),
      })

      const data = await response.json()
      console.log("Agent deployed:", data.deployment)
    } catch (error) {
      console.error("Failed to deploy agent:", error)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500"
      case "inactive":
        return "bg-gray-500"
      case "training":
        return "bg-yellow-500"
      case "error":
        return "bg-red-500"
      default:
        return "bg-gray-500"
    }
  }

  const totalInteractions = agents.reduce((sum, agent) => sum + (agent.metrics?.totalInteractions || 0), 0)
  const totalRevenue = agents.reduce((sum, agent) => sum + (agent.metrics?.revenueAttributed || 0), 0)
  const averageSatisfaction =
    agents.length > 0
      ? agents.reduce((sum, agent) => sum + (agent.metrics?.userSatisfaction || 0), 0) / agents.length
      : 0

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
                <Bot className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold font-serif">Agent Management</h1>
                <p className="text-sm text-muted-foreground">Deploy and manage AI agents</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Agent
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create New Agent</DialogTitle>
                  <DialogDescription>Choose a template and configure your AI agent</DialogDescription>
                </DialogHeader>
                <Tabs defaultValue="template" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="template">Choose Template</TabsTrigger>
                    <TabsTrigger value="custom">Custom Configuration</TabsTrigger>
                  </TabsList>
                  <TabsContent value="template" className="space-y-4">
                    <div className="grid gap-4">
                      {Object.entries(AGENT_TEMPLATES).map(([key, template]) => (
                        <Card
                          key={key}
                          className={`cursor-pointer transition-colors ${
                            selectedTemplate === key ? "border-primary" : "hover:border-primary/50"
                          }`}
                          onClick={() => setSelectedTemplate(key as keyof typeof AGENT_TEMPLATES)}
                        >
                          <CardHeader className="pb-2">
                            <CardTitle className="text-base">{template.name}</CardTitle>
                            <CardDescription>{template.description}</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="flex flex-wrap gap-1">
                              {template.capabilities.map((capability) => (
                                <Badge key={capability} variant="secondary" className="text-xs">
                                  {capability}
                                </Badge>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                    <Button
                      onClick={() =>
                        createAgent({
                          ...AGENT_TEMPLATES[selectedTemplate],
                          type: selectedTemplate as any,
                          model: "grok",
                          config: {
                            systemPrompt: AGENT_TEMPLATES[selectedTemplate].systemPrompt,
                            temperature: 0.7,
                            maxTokens: 500,
                            responseFormat: "text",
                            integrations: [],
                            triggers: [],
                            personality: AGENT_TEMPLATES[selectedTemplate].personality,
                          },
                        })
                      }
                      className="w-full"
                    >
                      Create Agent from Template
                    </Button>
                  </TabsContent>
                  <TabsContent value="custom" className="space-y-4">
                    <div className="grid gap-4">
                      <div>
                        <Label htmlFor="name">Agent Name</Label>
                        <Input id="name" placeholder="Enter agent name" />
                      </div>
                      <div>
                        <Label htmlFor="description">Description</Label>
                        <Textarea id="description" placeholder="Describe what this agent does" />
                      </div>
                      <div>
                        <Label htmlFor="type">Agent Type</Label>
                        <Select>
                          <SelectTrigger>
                            <SelectValue placeholder="Select agent type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="chat">Chat Assistant</SelectItem>
                            <SelectItem value="workflow">Workflow Automation</SelectItem>
                            <SelectItem value="analytics">Analytics Agent</SelectItem>
                            <SelectItem value="customer-service">Customer Service</SelectItem>
                            <SelectItem value="sales">Sales Assistant</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button className="w-full">Create Custom Agent</Button>
                  </TabsContent>
                </Tabs>
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
              <Bot className="h-4 w-4 text-muted-foreground" />
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
              <CardTitle className="text-sm font-medium">Total Interactions</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{totalInteractions.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Across all agents</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Revenue Generated</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">${totalRevenue.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">From agent interactions</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Satisfaction Score</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{averageSatisfaction.toFixed(1)}/5.0</div>
              <p className="text-xs text-muted-foreground">Average user rating</p>
            </CardContent>
          </Card>
        </div>

        {/* Agents Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Card key={agent.id} className="relative">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Bot className="h-5 w-5 text-primary" />
                      </div>
                      <div
                        className={`absolute -bottom-1 -right-1 h-3 w-3 rounded-full ${getStatusColor(agent.status)}`}
                      />
                    </div>
                    <div>
                      <CardTitle className="text-base">{agent.name}</CardTitle>
                      <CardDescription className="text-sm">{agent.description}</CardDescription>
                    </div>
                  </div>
                  <Badge variant={agent.status === "active" ? "default" : "secondary"}>{agent.status}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-1">
                    {agent.capabilities?.map((capability) => (
                      <Badge key={capability} variant="outline" className="text-xs">
                        {capability}
                      </Badge>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Interactions</p>
                      <p className="font-medium">{agent.metrics?.totalInteractions?.toLocaleString() || 0}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Success Rate</p>
                      <p className="font-medium">{agent.metrics?.successRate?.toFixed(1) || 0}%</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Avg Response</p>
                      <p className="font-medium">{agent.metrics?.averageResponseTime?.toFixed(1) || 0}s</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Revenue</p>
                      <p className="font-medium">${agent.metrics?.revenueAttributed?.toLocaleString() || 0}</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={agent.status === "active" ? "outline" : "default"}
                      onClick={() => toggleAgentStatus(agent.id, agent.status)}
                      className="flex-1"
                    >
                      {agent.status === "active" ? (
                        <>
                          <Pause className="h-3 w-3 mr-1" />
                          Pause
                        </>
                      ) : (
                        <>
                          <Play className="h-3 w-3 mr-1" />
                          Activate
                        </>
                      )}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => deployAgent(agent.id)}>
                      <Globe className="h-3 w-3 mr-1" />
                      Deploy
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
      </div>
    </div>
  )
}
