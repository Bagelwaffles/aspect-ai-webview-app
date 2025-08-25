"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  BarChart3,
  Package,
  Workflow,
  CreditCard,
  TrendingUp,
  ShoppingCart,
  Settings,
  Bell,
  Search,
  Plus,
  Activity,
  DollarSign,
  Eye,
  MoreHorizontal,
  Brain,
  Bot,
  Sparkles,
  Globe,
  Send,
  MessageSquare,
  Minimize2,
} from "lucide-react"

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("overview")
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      role: "assistant",
      content:
        "Hi! I'm your AI assistant. I can help you with your print-on-demand business, answer questions about orders, products, or workflows. How can I assist you today?",
      timestamp: new Date(),
    },
  ])
  const [chatInput, setChatInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleNavigation = (tab: string) => {
    if (tab === "products") {
      window.location.href = "/products"
    } else if (tab === "analytics") {
      window.location.href = "/analytics"
    } else if (tab === "workflows") {
      window.location.href = "/workflows"
    } else if (tab === "billing") {
      window.location.href = "/billing"
    } else if (tab === "ai-command") {
      window.location.href = "/ai-command"
    } else if (tab === "agents") {
      window.location.href = "/agents"
    } else if (tab === "relevance") {
      window.location.href = "/relevance"
    } else if (tab === "grok-chat") {
      window.location.href = "/grok-chat"
    } else if (tab === "deployments") {
      window.location.href = "/deployments"
    } else {
      setActiveTab(tab)
    }
  }

  const sendMessage = async () => {
    if (!chatInput.trim()) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: chatInput,
      timestamp: new Date(),
    }

    setChatMessages((prev) => [...prev, userMessage])
    setChatInput("")
    setIsLoading(true)

    try {
      const response = await fetch("/api/grok/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: "grok-support",
          message: chatInput,
          conversationHistory: chatMessages.slice(-6).map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
        }),
      })

      const data = await response.json()

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response || "I'm here to help! Could you please rephrase your question?",
        timestamp: new Date(),
      }

      setChatMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      console.error("Failed to send message:", error)
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "I'm sorry, I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: new Date(),
      }
      setChatMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center border-b border-sidebar-border px-6">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
                <Package className="h-5 w-5 text-sidebar-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-sidebar-foreground font-[family-name:var(--font-work-sans)]">
                Aspect Marketing Solutions
              </span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            {[
              { id: "overview", label: "Overview", icon: BarChart3 },
              { id: "ai-command", label: "AI Command", icon: Brain },
              { id: "agents", label: "Agents", icon: Bot },
              { id: "relevance", label: "Relevance AI", icon: Brain },
              { id: "grok-chat", label: "Grok Chat", icon: Sparkles },
              { id: "deployments", label: "Deployments", icon: Globe }, // Added deployments navigation
              { id: "products", label: "Products", icon: Package },
              { id: "workflows", label: "Workflows", icon: Workflow },
              { id: "billing", label: "Billing", icon: CreditCard },
              { id: "analytics", label: "Analytics", icon: TrendingUp },
              { id: "settings", label: "Settings", icon: Settings },
            ].map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigation(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    activeTab === item.id
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </button>
              )
            })}
          </nav>

          {/* User Profile */}
          <div className="border-t border-sidebar-border p-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src="/placeholder.svg?key=cx84q" />
                <AvatarFallback>JD</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">John Doe</p>
                <p className="text-xs text-muted-foreground truncate">john@example.com</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="pl-64">
        {/* Top Bar */}
        <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-16 items-center gap-4 px-6">
            <div className="flex-1">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  placeholder="Search products, orders, workflows..."
                  className="w-full rounded-lg border border-input bg-input pl-10 pr-4 py-2 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => handleNavigation("products")}>
                <Plus className="h-4 w-4 mr-2" />
                New Product
              </Button>
              <Button variant="ghost" size="sm">
                <Bell className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="p-6">
          {/* Stats Cards */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">$45,231.89</div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-accent">+20.1%</span> from last month
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Products</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">2,350</div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-accent">+180</span> new this month
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Orders</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">12,234</div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-accent">+19%</span> from last month
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Workflows</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">573</div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-accent">+201</span> since last hour
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main Dashboard Grid */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Recent Orders */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-work-sans)]">Recent Orders</CardTitle>
                <CardDescription>You have 256 orders this month.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    {
                      id: "#3210",
                      customer: "Olivia Martin",
                      product: "Custom T-Shirt",
                      status: "Processing",
                      amount: "$79.00",
                    },
                    {
                      id: "#3209",
                      customer: "Jackson Lee",
                      product: "Hoodie Design",
                      status: "Shipped",
                      amount: "$39.00",
                    },
                    {
                      id: "#3208",
                      customer: "Isabella Nguyen",
                      product: "Mug Print",
                      status: "Delivered",
                      amount: "$299.00",
                    },
                    {
                      id: "#3207",
                      customer: "William Kim",
                      product: "Poster Set",
                      status: "Processing",
                      amount: "$99.00",
                    },
                    {
                      id: "#3206",
                      customer: "Sofia Davis",
                      product: "Phone Case",
                      status: "Shipped",
                      amount: "$39.00",
                    },
                  ].map((order) => (
                    <div
                      key={order.id}
                      className="flex items-center justify-between p-4 border border-border rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <Avatar className="h-9 w-9">
                          <AvatarImage
                            src={`/abstract-geometric-shapes.png?height=36&width=36&query=${order.customer.replace(" ", "+")}`}
                          />
                          <AvatarFallback>
                            {order.customer
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{order.customer}</p>
                          <p className="text-sm text-muted-foreground">{order.product}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge
                          variant={
                            order.status === "Delivered"
                              ? "default"
                              : order.status === "Shipped"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {order.status}
                        </Badge>
                        <p className="text-sm font-medium">{order.amount}</p>
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-work-sans)]">Quick Actions</CardTitle>
                <CardDescription>Manage your business efficiently</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button className="w-full justify-start bg-transparent" variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Product
                </Button>
                <Button className="w-full justify-start bg-transparent" variant="outline">
                  <Workflow className="h-4 w-4 mr-2" />
                  Setup Workflow
                </Button>
                <Button className="w-full justify-start bg-transparent" variant="outline">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  View Analytics
                </Button>
                <Button className="w-full justify-start bg-transparent" variant="outline">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Billing Settings
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Workflow Status */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="font-[family-name:var(--font-work-sans)]">Active Workflows</CardTitle>
              <CardDescription>Monitor your automation processes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[
                  { name: "Product Sync", status: "Running", lastRun: "2 minutes ago", success: 98 },
                  { name: "Order Processing", status: "Running", lastRun: "5 minutes ago", success: 95 },
                  { name: "Inventory Update", status: "Paused", lastRun: "1 hour ago", success: 87 },
                  { name: "Customer Notifications", status: "Running", lastRun: "30 seconds ago", success: 99 },
                  { name: "Analytics Sync", status: "Running", lastRun: "10 minutes ago", success: 92 },
                  { name: "Backup Process", status: "Scheduled", lastRun: "6 hours ago", success: 100 },
                ].map((workflow) => (
                  <div key={workflow.name} className="p-4 border border-border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">{workflow.name}</h4>
                      <Badge
                        variant={
                          workflow.status === "Running"
                            ? "default"
                            : workflow.status === "Paused"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {workflow.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">Last run: {workflow.lastRun}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Success rate: {workflow.success}%</span>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </main>
      </div>

      {/* AI Chat Widget */}
      <div className="fixed bottom-6 right-6 z-50">
        {!isChatOpen ? (
          <Button
            onClick={() => setIsChatOpen(true)}
            className="h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-shadow"
            size="sm"
          >
            <MessageSquare className="h-6 w-6" />
          </Button>
        ) : (
          <Card className="w-80 h-96 shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary-foreground" />
                </div>
                <div>
                  <CardTitle className="text-sm">AI Assistant</CardTitle>
                  <CardDescription className="text-xs">Always here to help</CardDescription>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setIsChatOpen(false)}>
                <Minimize2 className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="p-0 flex flex-col h-80">
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {chatMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] p-2 rounded-lg text-sm ${
                          message.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <p>{message.content}</p>
                        <p className="text-xs opacity-70 mt-1">{message.timestamp.toLocaleTimeString()}</p>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-muted text-muted-foreground p-2 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="animate-spin h-3 w-3 border-2 border-primary border-t-transparent rounded-full" />
                          <span className="text-sm">Thinking...</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
              <div className="p-4 border-t border-border">
                <div className="flex gap-2">
                  <Input
                    placeholder="Ask me anything..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={isLoading}
                    className="flex-1 text-sm"
                  />
                  <Button onClick={sendMessage} disabled={isLoading || !chatInput.trim()} size="sm">
                    <Send className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
