"use client"

import Link from "next/link"
import { FormEvent, useEffect, useRef, useState } from "react"
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  Brain,
  CreditCard,
  Loader2,
  Send,
  ShieldCheck,
  Workflow,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type ChatMessage = {
  id: string
  type: "user" | "ai" | "error"
  content: string
}

type AiChatPayload = {
  response?: unknown
  code?: unknown
}

const systemStates = [
  {
    title: "AI guidance",
    status: "Guarded",
    description: "Requests must pass authentication, plan, credit, rate-limit, and provider checks.",
    icon: ShieldCheck,
  },
  {
    title: "Live business metrics",
    status: "Unavailable",
    description: "No verified analytics source is connected to this screen, so no revenue or efficiency totals are shown.",
    icon: BarChart3,
  },
  {
    title: "Workflow execution",
    status: "In progress",
    description: "AI Command does not start workflows until a real, authenticated execution route is available.",
    icon: Workflow,
  },
] as const

const navigation = [
  {
    title: "Agent catalog",
    description: "Review the three launch agents and their access requirements.",
    href: "/agents",
    icon: Bot,
  },
  {
    title: "Workflows",
    description: "Inspect connected workflow definitions and current availability.",
    href: "/workflows",
    icon: Workflow,
  },
  {
    title: "Billing",
    description: "Review plan, entitlement, and credit status for the signed-in account.",
    href: "/billing",
    icon: CreditCard,
  },
] as const

const apiErrorMessages: Record<string, string> = {
  CUSTOMER_AUTH_REQUIRED: "Sign in before using AI guidance.",
  SUBSCRIPTION_REQUIRED: "An active plan is required before using AI guidance.",
  CREDITS_REQUIRED: "No AI credits remain on this account.",
  ENTITLEMENTS_NOT_CONFIGURED: "The entitlement service is not configured.",
  AI_PROVIDER_NOT_CONFIGURED: "The AI provider is not configured.",
  RATE_LIMITED: "The request limit has been reached. Try again later.",
}

function createMessageId(prefix: string) {
  return `${prefix}-${Date.now()}`
}

function describeApiError(status: number, payload: AiChatPayload | null) {
  const code = typeof payload?.code === "string" ? payload.code : ""
  return apiErrorMessages[code] ?? `The AI request returned HTTP ${status}.`
}

export default function AICommandCenter() {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "ai-command-welcome",
      type: "ai",
      content:
        "Ask for practical marketing or automation guidance. This screen does not have connected live business metrics and does not start workflows.",
    },
  ])
  const [chatInput, setChatInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatMessages])

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const message = chatInput.trim()
    if (!message || isLoading) return

    setChatMessages((current) => [
      ...current,
      {
        id: createMessageId("user"),
        type: "user",
        content: message,
      },
    ])
    setChatInput("")
    setIsLoading(true)

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      })
      const payload = (await response.json().catch(() => null)) as AiChatPayload | null

      if (!response.ok) {
        const reason = describeApiError(response.status, payload)
        setChatMessages((current) => [
          ...current,
          {
            id: createMessageId("error"),
            type: "error",
            content: `${reason} No live analysis or workflow was started.`,
          },
        ])
        return
      }

      const responseText = typeof payload?.response === "string" ? payload.response.trim() : ""
      if (!responseText) {
        throw new Error("EMPTY_AI_RESPONSE")
      }

      setChatMessages((current) => [
        ...current,
        {
          id: createMessageId("assistant"),
          type: "ai",
          content: responseText,
        },
      ])
    } catch {
      setChatMessages((current) => [
        ...current,
        {
          id: createMessageId("network-error"),
          type: "error",
          content: "The AI request could not be completed. No live analysis or workflow was started.",
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Brain className="h-6 w-6" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold sm:text-3xl">AI Command</h1>
                <Badge variant="secondary">Controlled preview</Badge>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                API-backed guidance with honest service states. Unconnected analytics and workflow execution stay disabled.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" className="w-full shrink-0 sm:w-auto">
            <Link href="/">Back to dashboard</Link>
          </Button>
        </header>

        <section aria-labelledby="system-state-heading" className="space-y-3">
          <div>
            <h2 id="system-state-heading" className="text-xl font-semibold">
              Current system state
            </h2>
            <p className="text-sm text-muted-foreground">Only verified capabilities are presented as available.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {systemStates.map((item) => {
              const Icon = item.icon
              return (
                <Card key={item.title}>
                  <CardHeader className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <Icon className="h-5 w-5 text-primary" />
                      <Badge variant="outline">{item.status}</Badge>
                    </div>
                    <CardTitle className="text-lg">{item.title}</CardTitle>
                    <CardDescription className="leading-6">{item.description}</CardDescription>
                  </CardHeader>
                </Card>
              )
            })}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <Card className="min-w-0">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    AI guidance
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Errors remain visible and never become simulated analysis or workflow success.
                  </CardDescription>
                </div>
                <Badge variant={isLoading ? "default" : "secondary"}>{isLoading ? "Requesting" : "Ready"}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                aria-live="polite"
                className="h-[24rem] overflow-y-auto rounded-lg border bg-muted/20 p-3 sm:p-4"
              >
                <div className="space-y-3">
                  {chatMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[92%] rounded-lg px-3 py-2 text-sm leading-6 sm:max-w-[80%] ${
                          message.type === "user"
                            ? "bg-primary text-primary-foreground"
                            : message.type === "error"
                              ? "border border-destructive/40 bg-destructive/10 text-foreground"
                              : "bg-card text-foreground"
                        }`}
                      >
                        {message.content}
                      </div>
                    </div>
                  ))}
                  {isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Waiting for the API response
                    </div>
                  ) : null}
                  <div ref={chatEndRef} />
                </div>
              </div>

              <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSendMessage}>
                <label className="sr-only" htmlFor="ai-command-message">
                  Message for AI guidance
                </label>
                <Input
                  id="ai-command-message"
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="Ask for marketing or automation guidance"
                  disabled={isLoading}
                  autoComplete="off"
                  className="h-11 min-w-0 flex-1 text-base sm:text-sm"
                />
                <Button type="submit" disabled={isLoading || !chatInput.trim()} className="h-11 w-full sm:w-auto">
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send
                </Button>
              </form>
            </CardContent>
          </Card>

          <section aria-labelledby="next-actions-heading" className="space-y-3">
            <div>
              <h2 id="next-actions-heading" className="text-xl font-semibold">
                Next actions
              </h2>
              <p className="text-sm text-muted-foreground">Continue through verified platform routes.</p>
            </div>
            <div className="space-y-3">
              {navigation.map((item) => {
                const Icon = item.icon
                return (
                  <Card key={item.href}>
                    <CardHeader className="space-y-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <CardTitle className="text-base">{item.title}</CardTitle>
                      <CardDescription className="leading-6">{item.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button asChild variant="outline" className="w-full justify-between">
                        <Link href={item.href}>
                          Open
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
