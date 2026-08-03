"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Send, Bot, User, Sparkles, Zap } from "lucide-react"
import type { GrokAgentConfig } from "@/lib/grok-agents"

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  agentId?: string
}

interface CustomerGrokAgent extends GrokAgentConfig {
  slug: "content"
  entitled: boolean
  executionStatus: "available" | "subscription_required"
}

interface AccountSummary {
  plan: string | null
  subscriptionStatus: string
  creditsRemaining: number
}

export default function GrokChatPage() {
  const [agents, setAgents] = useState<CustomerGrokAgent[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string>("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputMessage, setInputMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [account, setAccount] = useState<AccountSummary | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchAgents()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const fetchAgents = async () => {
    try {
      const response = await fetch("/api/grok/agents")
      const data = await response.json()
      if (!response.ok) {
        setRequestError(data.error || "Customer access is required to load the Content Agent.")
        setAgents([])
        return
      }
      setRequestError(null)
      setAgents(data.agents || [])
      setAccount(data.account || null)
      if (data.agents?.length > 0) {
        setSelectedAgent(data.agents[0].id)
      }
    } catch {
      setRequestError("The Content Agent could not be loaded. Please try again.")
    }
  }

  const sendMessage = async () => {
    const selected = agents.find((agent) => agent.id === selectedAgent)
    const currentMessage = inputMessage.trim()
    if (!currentMessage || !selected?.entitled) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: currentMessage,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInputMessage("")
    setRequestError(null)
    setIsLoading(true)

    try {
      const conversationHistory = messages.slice(-10).map((msg) => ({
        role: msg.role,
        content: msg.content,
      }))

      const response = await fetch("/api/grok/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          agentId: selectedAgent,
          message: currentMessage,
          conversationHistory,
        }),
      })

      const data = await response.json()
      if (!response.ok || typeof data.response !== "string" || !data.response.trim()) {
        setRequestError(data.error || `The Content Agent request failed (${response.status}).`)
        return
      }

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
        agentId: selectedAgent,
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch {
      setRequestError("The Content Agent request could not be completed. Please try again.")
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

  const selectedAgentConfig = agents.find((agent) => agent.id === selectedAgent)

  const getPersonalityColor = (personality: string) => {
    switch (personality) {
      case "professional":
        return "bg-blue-500"
      case "friendly":
        return "bg-green-500"
      case "technical":
        return "bg-purple-500"
      case "sales":
        return "bg-orange-500"
      case "support":
        return "bg-cyan-500"
      case "witty":
        return "bg-pink-500"
      default:
        return "bg-gray-500"
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold font-serif">Grok Chat Agents</h1>
                <p className="text-sm text-muted-foreground">AI-powered conversations with specialized agents</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Zap className="h-3 w-3" />
              Powered by Grok
            </Badge>
            {account && (
              <Badge variant="outline">{account.creditsRemaining} credits</Badge>
            )}
            <Button variant="outline" onClick={() => (window.location.href = "/")}>
              Dashboard
            </Button>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-4rem)] flex-col lg:h-[calc(100vh-4rem)] lg:flex-row">
        {/* Agent Selection Sidebar */}
        <div className="w-full border-b border-border bg-card/30 lg:w-80 lg:border-b-0 lg:border-r">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold mb-3">Select Agent</h2>
            <Select value={selectedAgent} onValueChange={setSelectedAgent} disabled={agents.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedAgentConfig && (
            <div className="p-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-10 w-10 rounded-lg ${getPersonalityColor(selectedAgentConfig.personality)} flex items-center justify-center`}
                    >
                      <Bot className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{selectedAgentConfig.name}</CardTitle>
                      <Badge variant="outline" className="text-xs mt-1">
                        {selectedAgentConfig.personality}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Capabilities</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedAgentConfig.capabilities.map((capability) => (
                          <Badge key={capability} variant="secondary" className="text-xs">
                            {capability}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <p>Model: {selectedAgentConfig.model}</p>
                      <p>Temperature: {selectedAgentConfig.temperature}</p>
                      <p>
                        Access: {selectedAgentConfig.entitled ? "Enabled" : "Subscription required"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Chat Interface */}
        <div className="flex min-h-[34rem] flex-1 flex-col">
          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4 max-w-4xl mx-auto">
              {requestError && (
                <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {requestError}
                </div>
              )}
              {messages.length === 0 && selectedAgentConfig && (
                <div className="text-center py-8">
                  <div
                    className={`h-16 w-16 rounded-full ${getPersonalityColor(selectedAgentConfig.personality)} flex items-center justify-center mx-auto mb-4`}
                  >
                    <Bot className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Chat with {selectedAgentConfig.name}</h3>
                  <p className="text-muted-foreground">
                    Start a conversation with your specialized {selectedAgentConfig.personality} agent
                  </p>
                </div>
              )}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {message.role === "assistant" && (
                    <Avatar className="h-8 w-8 mt-1">
                      <AvatarFallback
                        className={getPersonalityColor(selectedAgentConfig?.personality || "professional")}
                      >
                        <Bot className="h-4 w-4 text-white" />
                      </AvatarFallback>
                    </Avatar>
                  )}

                  <div
                    className={`max-w-[70%] p-3 rounded-lg ${
                      message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    <p className="text-xs opacity-70 mt-1">{message.timestamp.toLocaleTimeString()}</p>
                  </div>

                  {message.role === "user" && (
                    <Avatar className="h-8 w-8 mt-1">
                      <AvatarFallback className="bg-primary">
                        <User className="h-4 w-4 text-primary-foreground" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3 justify-start">
                  <Avatar className="h-8 w-8 mt-1">
                    <AvatarFallback className={getPersonalityColor(selectedAgentConfig?.personality || "professional")}>
                      <Bot className="h-4 w-4 text-white" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-muted text-muted-foreground p-3 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                      <span className="text-sm">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="border-t border-border p-4">
            <div className="max-w-4xl mx-auto">
              <div className="flex gap-2">
                <Input
                  placeholder={`Message ${selectedAgentConfig?.name || "agent"}...`}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyPress}
                  disabled={isLoading || !selectedAgentConfig?.entitled}
                  className="flex-1"
                />
                <Button
                  onClick={sendMessage}
                  disabled={isLoading || !inputMessage.trim() || !selectedAgentConfig?.entitled}
                  className="gap-2"
                >
                  <Send className="h-4 w-4" />
                  Send
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
