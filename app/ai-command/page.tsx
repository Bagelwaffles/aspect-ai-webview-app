"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Brain,
  Zap,
  TrendingUp,
  Bot,
  Send,
  Sparkles,
  Activity,
  Lightbulb,
  ArrowUp,
  ArrowDown,
  DollarSign,
  Minimize2,
  Maximize2,
} from "lucide-react"

interface ChatMessage {
  id: string
  type: "user" | "ai"
  content: string
  timestamp: Date
}

interface WorkflowSuggestion {
  id: string
  title: string
  description: string
  impact: "high" | "medium" | "low"
  category: string
  estimatedSavings: string
}

interface MarketInsight {
  id: string
  title: string
  trend: "up" | "down" | "stable"
  value: string
  change: string
  description: string
}

export default function AICommandCenter() {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      type: "ai",
      content:
        "Welcome to your AI Command Center! I'm here to help optimize your print-on-demand business. What would you like to analyze today?",
      timestamp: new Date(),
    },
  ])
  const [chatInput, setChatInput] = useState("")
  const [isChatMinimized, setIsChatMinimized] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const workflowSuggestions: WorkflowSuggestion[] = [
    {
      id: "1",
      title: "Auto-Price Optimization",
      description: "Dynamically adjust product prices based on market demand and competitor analysis",
      impact: "high",
      category: "Pricing",
      estimatedSavings: "$2,400/month",
    },
    {
      id: "2",
      title: "Smart Inventory Sync",
      description: "Automatically sync inventory levels across all sales channels to prevent overselling",
      impact: "high",
      category: "Inventory",
      estimatedSavings: "$1,800/month",
    },
    {
      id: "3",
      title: "Customer Segmentation",
      description: "Create targeted marketing campaigns based on purchase behavior patterns",
      impact: "medium",
      category: "Marketing",
      estimatedSavings: "$1,200/month",
    },
    {
      id: "4",
      title: "Quality Control Alerts",
      description: "Monitor product reviews and automatically flag quality issues for investigation",
      impact: "medium",
      category: "Quality",
      estimatedSavings: "$800/month",
    },
  ]

  const marketInsights: MarketInsight[] = [
    {
      id: "1",
      title: "Holiday Apparel Demand",
      trend: "up",
      value: "342%",
      change: "+89% vs last week",
      description: "Christmas-themed apparel showing massive growth",
    },
    {
      id: "2",
      title: "Eco-Friendly Products",
      trend: "up",
      value: "156%",
      change: "+23% vs last month",
      description: "Sustainable materials gaining traction",
    },
    {
      id: "3",
      title: "Phone Case Market",
      trend: "down",
      value: "78%",
      change: "-12% vs last month",
      description: "Oversaturation in phone accessories",
    },
    {
      id: "4",
      title: "Custom Mugs",
      trend: "stable",
      value: "124%",
      change: "+2% vs last month",
      description: "Consistent demand for personalized drinkware",
    },
  ]

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: "user",
      content: chatInput,
      timestamp: new Date(),
    }

    setChatMessages((prev) => [...prev, userMessage])
    setChatInput("")
    setIsLoading(true)

    // Simulate AI response using Grok integration
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: chatInput }),
      })

      const data = await response.json()

      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: "ai",
        content:
          data.response ||
          "I'm analyzing your request and will provide insights shortly. Let me process the latest market data and workflow patterns.",
        timestamp: new Date(),
      }

      setChatMessages((prev) => [...prev, aiMessage])
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: "ai",
        content:
          "I'm currently processing a high volume of data. Let me provide you with some immediate insights based on your current business metrics.",
        timestamp: new Date(),
      }
      setChatMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleImplementSuggestion = async (suggestion: WorkflowSuggestion) => {
    try {
      await fetch("/api/n8n/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: "workflow_automation",
          payload: { suggestionId: suggestion.id, action: "implement" },
        }),
      })

      const aiMessage: ChatMessage = {
        id: Date.now().toString(),
        type: "ai",
        content: `I've initiated the implementation of "${suggestion.title}". The workflow is being configured and will be active within the next few minutes. You can monitor its progress in the Workflows section.`,
        timestamp: new Date(),
      }
      setChatMessages((prev) => [...prev, aiMessage])
    } catch (error) {
      console.error("Failed to implement suggestion:", error)
    }
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatMessages])

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center pulse-glow">
                <Brain className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold font-serif">AI Command Center</h1>
                <p className="text-sm text-muted-foreground">Intelligent Business Automation</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Activity className="h-3 w-3" />
              Live Analysis
            </Badge>
            <Button variant="outline" size="sm" onClick={() => (window.location.href = "/")}>
              Dashboard
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Main Content */}
        <div className="flex-1 p-6">
          {/* AI Insights Overview */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">AI Efficiency Score</CardTitle>
                <Sparkles className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">94.2%</div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-accent">+12.3%</span> optimization this week
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Automated Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">$67,890</div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-accent">+34.2%</span> from AI workflows
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active AI Agents</CardTitle>
                <Bot className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">23</div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-accent">+5</span> deployed this week
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Time Saved</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">127h</div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-accent">+23h</span> this week
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main Grid */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Intelligent Workflow Suggestions */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-serif">
                  <Lightbulb className="h-5 w-5 text-accent" />
                  AI Workflow Suggestions
                </CardTitle>
                <CardDescription>
                  Intelligent automation recommendations based on your business patterns
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {workflowSuggestions.map((suggestion) => (
                    <div
                      key={suggestion.id}
                      className="p-4 border border-border rounded-lg hover:border-primary/50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h4 className="font-medium mb-1">{suggestion.title}</h4>
                          <p className="text-sm text-muted-foreground mb-2">{suggestion.description}</p>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                suggestion.impact === "high"
                                  ? "default"
                                  : suggestion.impact === "medium"
                                    ? "secondary"
                                    : "outline"
                              }
                            >
                              {suggestion.impact} impact
                            </Badge>
                            <Badge variant="outline">{suggestion.category}</Badge>
                            <span className="text-sm font-medium text-accent">{suggestion.estimatedSavings}</span>
                          </div>
                        </div>
                        <Button size="sm" onClick={() => handleImplementSuggestion(suggestion)} className="ml-4">
                          Implement
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Market Analysis */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-serif">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Real-Time Market Analysis
                </CardTitle>
                <CardDescription>AI-powered market insights and trend predictions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {marketInsights.map((insight) => (
                    <div key={insight.id} className="p-4 border border-border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">{insight.title}</h4>
                        <div className="flex items-center gap-2">
                          {insight.trend === "up" ? (
                            <ArrowUp className="h-4 w-4 text-accent" />
                          ) : insight.trend === "down" ? (
                            <ArrowDown className="h-4 w-4 text-destructive" />
                          ) : (
                            <div className="h-4 w-4 rounded-full bg-muted" />
                          )}
                          <span className="text-lg font-bold text-primary">{insight.value}</span>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mb-1">{insight.description}</p>
                      <p className="text-xs text-muted-foreground">{insight.change}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* AI Chat Assistant */}
      <div className={`fixed bottom-6 right-6 z-50 ${isChatMinimized ? "w-80" : "w-96"}`}>
        <Card className="border-primary/20 shadow-2xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center pulse-glow">
                <Bot className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <CardTitle className="text-sm font-serif">AI Assistant</CardTitle>
                <CardDescription className="text-xs">Powered by Grok</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setIsChatMinimized(!isChatMinimized)}>
                {isChatMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
              </Button>
            </div>
          </CardHeader>
          {!isChatMinimized && (
            <CardContent className="p-0">
              <ScrollArea className="h-80 p-4">
                <div className="space-y-4">
                  {chatMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] p-3 rounded-lg ${
                          message.type === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <p className="text-sm">{message.content}</p>
                        <p className="text-xs opacity-70 mt-1">{message.timestamp.toLocaleTimeString()}</p>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-muted text-muted-foreground p-3 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                          <span className="text-sm">AI is thinking...</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              </ScrollArea>
              <div className="p-4 border-t border-border">
                <div className="flex gap-2">
                  <Input
                    placeholder="Ask me anything about your business..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                    className="flex-1"
                  />
                  <Button onClick={handleSendMessage} disabled={isLoading}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  )
}
