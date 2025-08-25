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
import { Switch } from "@/components/ui/switch"
import { Progress } from "@/components/ui/progress"
import {
  Workflow,
  Plus,
  Play,
  Pause,
  Settings,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Activity,
  GitBranch,
  Timer,
  BarChart3,
  Eye,
  Edit,
  Copy,
  Download,
  Upload,
} from "lucide-react"

interface WorkflowData {
  id: string
  name: string
  description: string
  status: "active" | "paused" | "error" | "draft"
  trigger: string
  lastRun: string
  nextRun?: string
  successRate: number
  totalRuns: number
  avgDuration: number
  nodes: number
  category: string
  created: string
}

interface WorkflowExecution {
  id: string
  workflowId: string
  status: "success" | "error" | "running" | "waiting"
  startTime: string
  endTime?: string
  duration?: number
  error?: string
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowData[]>([])
  const [executions, setExecutions] = useState<WorkflowExecution[]>([])
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Mock data for demonstration
  useEffect(() => {
    setWorkflows([
      {
        id: "1",
        name: "Product Sync Automation",
        description: "Automatically sync products from Printify to all connected shops",
        status: "active",
        trigger: "Schedule (Every 15 minutes)",
        lastRun: "2 minutes ago",
        nextRun: "13 minutes",
        successRate: 98,
        totalRuns: 1247,
        avgDuration: 45,
        nodes: 8,
        category: "Product Management",
        created: "2024-01-15",
      },
      {
        id: "2",
        name: "Order Processing Pipeline",
        description: "Process new orders, update inventory, and send notifications",
        status: "active",
        trigger: "Webhook (New Order)",
        lastRun: "5 minutes ago",
        successRate: 95,
        totalRuns: 892,
        avgDuration: 32,
        nodes: 12,
        category: "Order Management",
        created: "2024-01-10",
      },
      {
        id: "3",
        name: "Customer Email Campaign",
        description: "Send personalized emails based on customer behavior",
        status: "paused",
        trigger: "Event (Customer Action)",
        lastRun: "2 hours ago",
        successRate: 87,
        totalRuns: 456,
        avgDuration: 18,
        nodes: 6,
        category: "Marketing",
        created: "2024-01-08",
      },
      {
        id: "4",
        name: "Inventory Alert System",
        description: "Monitor stock levels and send alerts when low",
        status: "active",
        trigger: "Schedule (Daily)",
        lastRun: "6 hours ago",
        nextRun: "18 hours",
        successRate: 99,
        totalRuns: 234,
        avgDuration: 12,
        nodes: 4,
        category: "Inventory",
        created: "2024-01-05",
      },
      {
        id: "5",
        name: "Analytics Data Sync",
        description: "Collect and process analytics data from all sources",
        status: "error",
        trigger: "Schedule (Hourly)",
        lastRun: "1 hour ago",
        successRate: 92,
        totalRuns: 678,
        avgDuration: 67,
        nodes: 15,
        category: "Analytics",
        created: "2024-01-12",
      },
    ])

    setExecutions([
      {
        id: "1",
        workflowId: "1",
        status: "success",
        startTime: "2024-01-25T10:30:00Z",
        endTime: "2024-01-25T10:30:45Z",
        duration: 45,
      },
      {
        id: "2",
        workflowId: "2",
        status: "success",
        startTime: "2024-01-25T10:25:00Z",
        endTime: "2024-01-25T10:25:32Z",
        duration: 32,
      },
      {
        id: "3",
        workflowId: "1",
        status: "success",
        startTime: "2024-01-25T10:15:00Z",
        endTime: "2024-01-25T10:15:43Z",
        duration: 43,
      },
      {
        id: "4",
        workflowId: "5",
        status: "error",
        startTime: "2024-01-25T09:30:00Z",
        endTime: "2024-01-25T09:31:12Z",
        duration: 72,
        error: "API rate limit exceeded",
      },
      { id: "5", workflowId: "2", status: "running", startTime: "2024-01-25T10:32:00Z" },
    ])
  }, [])

  const handleCreateWorkflow = async (formData: FormData) => {
    setIsLoading(true)
    try {
      // Simulate API call to create workflow
      await new Promise((resolve) => setTimeout(resolve, 2000))
      setIsCreateDialogOpen(false)
      // Refresh workflows list
    } catch (error) {
      console.error("Failed to create workflow:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleWorkflowAction = async (workflowId: string, action: "start" | "pause" | "stop") => {
    setIsLoading(true)
    try {
      // Simulate API call to control workflow
      await new Promise((resolve) => setTimeout(resolve, 1000))
      // Update workflow status
    } catch (error) {
      console.error(`Failed to ${action} workflow:`, error)
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "paused":
        return <Pause className="h-4 w-4 text-yellow-500" />
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />
      case "draft":
        return <AlertCircle className="h-4 w-4 text-gray-500" />
      default:
        return <Activity className="h-4 w-4" />
    }
  }

  const getExecutionStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />
      case "running":
        return <Activity className="h-4 w-4 text-blue-500 animate-spin" />
      case "waiting":
        return <Clock className="h-4 w-4 text-yellow-500" />
      default:
        return <Activity className="h-4 w-4" />
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Workflow className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-card-foreground font-[family-name:var(--font-work-sans)]">
                Workflow Automation
              </h1>
              <p className="text-sm text-muted-foreground">Manage your n8n automation workflows</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4 mr-2" />
              Import
            </Button>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Workflow
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create New Workflow</DialogTitle>
                  <DialogDescription>Set up a new automation workflow for your business</DialogDescription>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const formData = new FormData(e.currentTarget)
                    handleCreateWorkflow(formData)
                  }}
                >
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="name">Workflow Name</Label>
                      <Input id="name" name="name" placeholder="Enter workflow name" required />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        name="description"
                        placeholder="Describe what this workflow does"
                        rows={3}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="category">Category</Label>
                        <Select name="category" required>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="product">Product Management</SelectItem>
                            <SelectItem value="order">Order Management</SelectItem>
                            <SelectItem value="marketing">Marketing</SelectItem>
                            <SelectItem value="inventory">Inventory</SelectItem>
                            <SelectItem value="analytics">Analytics</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="trigger">Trigger Type</Label>
                        <Select name="trigger" required>
                          <SelectTrigger>
                            <SelectValue placeholder="Select trigger" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="schedule">Schedule</SelectItem>
                            <SelectItem value="webhook">Webhook</SelectItem>
                            <SelectItem value="event">Event</SelectItem>
                            <SelectItem value="manual">Manual</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isLoading}>
                      {isLoading ? "Creating..." : "Create Workflow"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="p-6">
        <Tabs defaultValue="workflows" className="space-y-6">
          <TabsList>
            <TabsTrigger value="workflows">Workflows</TabsTrigger>
            <TabsTrigger value="executions">Executions</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="workflows" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Workflows</CardTitle>
                  <Workflow className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">
                    {workflows.filter((w) => w.status === "active").length}
                  </div>
                  <p className="text-xs text-muted-foreground">{workflows.length} total workflows</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">94.2%</div>
                  <p className="text-xs text-muted-foreground">
                    <span className="text-accent">+2.1%</span> from last week
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Executions</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">3,507</div>
                  <p className="text-xs text-muted-foreground">
                    <span className="text-accent">+573</span> this month
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
                  <Timer className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">38s</div>
                  <p className="text-xs text-muted-foreground">
                    <span className="text-accent">-5s</span> from last week
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Workflows List */}
            <div className="grid gap-6">
              {workflows.map((workflow) => (
                <Card key={workflow.id} className="overflow-hidden">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(workflow.status)}
                        <div>
                          <CardTitle className="text-lg">{workflow.name}</CardTitle>
                          <CardDescription>{workflow.description}</CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{workflow.category}</Badge>
                        <Badge
                          variant={
                            workflow.status === "active"
                              ? "default"
                              : workflow.status === "paused"
                                ? "secondary"
                                : workflow.status === "error"
                                  ? "destructive"
                                  : "outline"
                          }
                        >
                          {workflow.status}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Trigger</p>
                        <p className="font-medium">{workflow.trigger}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Last Run</p>
                        <p className="font-medium">{workflow.lastRun}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Success Rate</p>
                        <div className="flex items-center gap-2">
                          <Progress value={workflow.successRate} className="flex-1" />
                          <span className="text-sm font-medium">{workflow.successRate}%</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Avg Duration</p>
                        <p className="font-medium">{workflow.avgDuration}s</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{workflow.totalRuns} runs</span>
                        <span>{workflow.nodes} nodes</span>
                        <span>Created {workflow.created}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {workflow.status === "active" ? (
                          <Button variant="ghost" size="sm" onClick={() => handleWorkflowAction(workflow.id, "pause")}>
                            <Pause className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => handleWorkflowAction(workflow.id, "start")}>
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Settings className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="executions" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-work-sans)]">Recent Executions</CardTitle>
                <CardDescription>Latest workflow execution results</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {executions.map((execution) => {
                    const workflow = workflows.find((w) => w.id === execution.workflowId)
                    return (
                      <div
                        key={execution.id}
                        className="flex items-center justify-between p-4 border border-border rounded-lg"
                      >
                        <div className="flex items-center gap-4">
                          {getExecutionStatusIcon(execution.status)}
                          <div>
                            <p className="font-medium">{workflow?.name}</p>
                            <p className="text-sm text-muted-foreground">
                              Started {new Date(execution.startTime).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <Badge
                              variant={
                                execution.status === "success"
                                  ? "default"
                                  : execution.status === "error"
                                    ? "destructive"
                                    : execution.status === "running"
                                      ? "secondary"
                                      : "outline"
                              }
                            >
                              {execution.status}
                            </Badge>
                            {execution.duration && (
                              <p className="text-sm text-muted-foreground mt-1">{execution.duration}s</p>
                            )}
                          </div>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  name: "Product Sync Template",
                  description: "Sync products between Printify and your stores",
                  category: "Product Management",
                  nodes: 8,
                  difficulty: "Beginner",
                },
                {
                  name: "Order Processing Template",
                  description: "Complete order fulfillment automation",
                  category: "Order Management",
                  nodes: 12,
                  difficulty: "Intermediate",
                },
                {
                  name: "Customer Segmentation",
                  description: "Automatically segment customers based on behavior",
                  category: "Marketing",
                  nodes: 15,
                  difficulty: "Advanced",
                },
                {
                  name: "Inventory Monitoring",
                  description: "Monitor stock levels and send alerts",
                  category: "Inventory",
                  nodes: 6,
                  difficulty: "Beginner",
                },
                {
                  name: "Analytics Dashboard Sync",
                  description: "Collect data from multiple sources",
                  category: "Analytics",
                  nodes: 10,
                  difficulty: "Intermediate",
                },
                {
                  name: "Social Media Automation",
                  description: "Auto-post new products to social media",
                  category: "Marketing",
                  nodes: 7,
                  difficulty: "Beginner",
                },
              ].map((template, index) => (
                <Card key={index}>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                    </div>
                    <CardDescription>{template.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Category</span>
                        <Badge variant="outline">{template.category}</Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Nodes</span>
                        <span>{template.nodes}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Difficulty</span>
                        <Badge
                          variant={
                            template.difficulty === "Beginner"
                              ? "default"
                              : template.difficulty === "Intermediate"
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {template.difficulty}
                        </Badge>
                      </div>
                      <Button className="w-full mt-4">
                        <Download className="h-4 w-4 mr-2" />
                        Use Template
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-work-sans)]">Workflow Settings</CardTitle>
                <CardDescription>Configure global workflow preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="auto-retry">Auto Retry Failed Workflows</Label>
                    <p className="text-sm text-muted-foreground">Automatically retry failed workflows up to 3 times</p>
                  </div>
                  <Switch id="auto-retry" defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="notifications">Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">Receive email alerts for workflow failures</p>
                  </div>
                  <Switch id="notifications" defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="logging">Detailed Logging</Label>
                    <p className="text-sm text-muted-foreground">Enable verbose logging for debugging</p>
                  </div>
                  <Switch id="logging" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timeout">Default Timeout (seconds)</Label>
                  <Input id="timeout" type="number" defaultValue="300" className="max-w-xs" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="concurrent">Max Concurrent Executions</Label>
                  <Input id="concurrent" type="number" defaultValue="10" className="max-w-xs" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-work-sans)]">n8n Connection</CardTitle>
                <CardDescription>Manage your n8n instance connection</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="font-medium">Connected to n8n instance</span>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="n8n-url">n8n Instance URL</Label>
                  <Input id="n8n-url" defaultValue="https://flow.aspectmarketingsolutions.app" disabled />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline">Test Connection</Button>
                  <Button variant="outline">Reconnect</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
