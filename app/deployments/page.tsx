"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Globe,
  Plus,
  Settings,
  Copy,
  Eye,
  Play,
  Pause,
  BarChart3,
  CheckCircle,
  AlertCircle,
  Clock,
  TrendingUp,
} from "lucide-react"
import type { AgentDeployment } from "@/lib/deployment"

export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<AgentDeployment[]>([])
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [selectedDeployment, setSelectedDeployment] = useState<AgentDeployment | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Form state for creating new deployment
  const [newDeployment, setNewDeployment] = useState({
    agentId: "",
    agentName: "",
    agentType: "",
    name: "",
    config: {
      position: "bottom-right" as const,
      theme: "light" as const,
      size: "medium" as const,
      autoOpen: false,
      greeting: "Hi! How can I help you today?",
      placeholder: "Type your message...",
      primaryColor: "#0ea5e9",
      backgroundColor: "#ffffff",
      textColor: "#1f2937",
      borderRadius: 12,
      showBranding: true,
    },
  })

  useEffect(() => {
    fetchDeployments()
  }, [])

  const fetchDeployments = async () => {
    try {
      const response = await fetch("/api/deployments")
      const data = await response.json()
      setDeployments(data.deployments || [])
    } catch (error) {
      console.error("Failed to fetch deployments:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const createDeployment = async () => {
    try {
      const response = await fetch("/api/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newDeployment),
      })

      if (response.ok) {
        fetchDeployments()
        setIsCreateDialogOpen(false)
        // Reset form
        setNewDeployment({
          agentId: "",
          agentName: "",
          agentType: "",
          name: "",
          config: {
            position: "bottom-right",
            theme: "light",
            size: "medium",
            autoOpen: false,
            greeting: "Hi! How can I help you today?",
            placeholder: "Type your message...",
            primaryColor: "#0ea5e9",
            backgroundColor: "#ffffff",
            textColor: "#1f2937",
            borderRadius: 12,
            showBranding: true,
          },
        })
      }
    } catch (error) {
      console.error("Failed to create deployment:", error)
    }
  }

  const toggleDeploymentStatus = async (deploymentId: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active"

    try {
      await fetch(`/api/deployments/${deploymentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })

      fetchDeployments()
    } catch (error) {
      console.error("Failed to update deployment status:", error)
    }
  }

  const copyEmbedCode = (embedCode: string) => {
    navigator.clipboard.writeText(embedCode)
    // You could add a toast notification here
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "inactive":
        return <AlertCircle className="h-4 w-4 text-gray-500" />
      case "deploying":
        return <Clock className="h-4 w-4 text-yellow-500" />
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />
    }
  }

  const getPositionLabel = (position: string) => {
    return position
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  }

  const totalInteractions = deployments.reduce((sum, d) => sum + d.analytics.totalInteractions, 0)
  const averageConversion =
    deployments.length > 0
      ? deployments.reduce((sum, d) => sum + d.analytics.conversionRate, 0) / deployments.length
      : 0

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
                <Globe className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold font-serif">Agent Deployments</h1>
                <p className="text-sm text-muted-foreground">Deploy and manage your AI agents</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  New Deployment
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create New Deployment</DialogTitle>
                  <DialogDescription>Deploy an AI agent to your website or application</DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="basic" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="basic">Basic Info</TabsTrigger>
                    <TabsTrigger value="appearance">Appearance</TabsTrigger>
                    <TabsTrigger value="behavior">Behavior</TabsTrigger>
                  </TabsList>

                  <TabsContent value="basic" className="space-y-4">
                    <div className="grid gap-4">
                      <div>
                        <Label htmlFor="deployment-name">Deployment Name</Label>
                        <Input
                          id="deployment-name"
                          placeholder="e.g., Main Website Support"
                          value={newDeployment.name}
                          onChange={(e) => setNewDeployment((prev) => ({ ...prev, name: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label htmlFor="agent-selection">Select Agent</Label>
                        <Select
                          value={newDeployment.agentId}
                          onValueChange={(value) =>
                            setNewDeployment((prev) => ({
                              ...prev,
                              agentId: value,
                              agentName: "Customer Support Agent", // This would come from actual agent data
                              agentType: "customer-service",
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose an agent to deploy" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="grok-support">Customer Support Agent</SelectItem>
                            <SelectItem value="grok-sales">Sales Assistant</SelectItem>
                            <SelectItem value="grok-tech">Technical Expert</SelectItem>
                            <SelectItem value="grok-advisor">Business Advisor</SelectItem>
                            <SelectItem value="grok-creative">Creative Assistant</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="appearance" className="space-y-4">
                    <div className="grid gap-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="position">Position</Label>
                          <Select
                            value={newDeployment.config.position}
                            onValueChange={(value: any) =>
                              setNewDeployment((prev) => ({
                                ...prev,
                                config: { ...prev.config, position: value },
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="bottom-right">Bottom Right</SelectItem>
                              <SelectItem value="bottom-left">Bottom Left</SelectItem>
                              <SelectItem value="top-right">Top Right</SelectItem>
                              <SelectItem value="top-left">Top Left</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="theme">Theme</Label>
                          <Select
                            value={newDeployment.config.theme}
                            onValueChange={(value: any) =>
                              setNewDeployment((prev) => ({
                                ...prev,
                                config: { ...prev.config, theme: value },
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="light">Light</SelectItem>
                              <SelectItem value="dark">Dark</SelectItem>
                              <SelectItem value="auto">Auto</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="primary-color">Primary Color</Label>
                          <Input
                            type="color"
                            value={newDeployment.config.primaryColor}
                            onChange={(e) =>
                              setNewDeployment((prev) => ({
                                ...prev,
                                config: { ...prev.config, primaryColor: e.target.value },
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="size">Size</Label>
                          <Select
                            value={newDeployment.config.size}
                            onValueChange={(value: any) =>
                              setNewDeployment((prev) => ({
                                ...prev,
                                config: { ...prev.config, size: value },
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="small">Small</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="large">Large</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="behavior" className="space-y-4">
                    <div className="grid gap-4">
                      <div>
                        <Label htmlFor="greeting">Greeting Message</Label>
                        <Input
                          value={newDeployment.config.greeting}
                          onChange={(e) =>
                            setNewDeployment((prev) => ({
                              ...prev,
                              config: { ...prev.config, greeting: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="placeholder">Input Placeholder</Label>
                        <Input
                          value={newDeployment.config.placeholder}
                          onChange={(e) =>
                            setNewDeployment((prev) => ({
                              ...prev,
                              config: { ...prev.config, placeholder: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={newDeployment.config.autoOpen}
                          onCheckedChange={(checked) =>
                            setNewDeployment((prev) => ({
                              ...prev,
                              config: { ...prev.config, autoOpen: checked },
                            }))
                          }
                        />
                        <Label>Auto-open chat widget</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={newDeployment.config.showBranding}
                          onCheckedChange={(checked) =>
                            setNewDeployment((prev) => ({
                              ...prev,
                              config: { ...prev.config, showBranding: checked },
                            }))
                          }
                        />
                        <Label>Show Aspect Marketing Solutions branding</Label>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={createDeployment} disabled={!newDeployment.name || !newDeployment.agentId}>
                    Create Deployment
                  </Button>
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
              <CardTitle className="text-sm font-medium">Active Deployments</CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {deployments.filter((d) => d.status === "active").length}
              </div>
              <p className="text-xs text-muted-foreground">{deployments.length} total deployments</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Interactions</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{totalInteractions.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Across all deployments</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Conversion Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{averageConversion.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">From visitor to lead</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unique Visitors</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {deployments.reduce((sum, d) => sum + d.analytics.uniqueVisitors, 0).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>
        </div>

        {/* Deployments Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {deployments.map((deployment) => (
            <Card key={deployment.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Globe className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{deployment.name}</CardTitle>
                      <CardDescription className="text-sm">{deployment.agentName}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(deployment.status)}
                    <Badge variant={deployment.status === "active" ? "default" : "secondary"}>
                      {deployment.status}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Position</p>
                      <p className="font-medium">{getPositionLabel(deployment.config.position)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Theme</p>
                      <p className="font-medium capitalize">{deployment.config.theme}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Interactions</p>
                      <p className="font-medium">{deployment.analytics.totalInteractions.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Conversion</p>
                      <p className="font-medium">{deployment.analytics.conversionRate.toFixed(1)}%</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={deployment.status === "active" ? "outline" : "default"}
                      onClick={() => toggleDeploymentStatus(deployment.id, deployment.status)}
                      className="flex-1"
                    >
                      {deployment.status === "active" ? (
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
                    <Button size="sm" variant="outline" onClick={() => copyEmbedCode(deployment.embedCode)}>
                      <Copy className="h-3 w-3 mr-1" />
                      Copy Code
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
