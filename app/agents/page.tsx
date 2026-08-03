import Link from "next/link"
import { BarChart3, Bot, FileText, LockKeyhole, Sparkles, Target } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const launchAgents = [
  {
    id: "grok-content",
    slug: "content",
    name: "Content Agent",
    icon: FileText,
    status: "Launch agent",
    description: "Creates marketing copy, product descriptions, email drafts, and social content from customer instructions.",
    capabilities: ["Marketing copy", "Product descriptions", "Email drafts", "Social content"],
  },
  {
    id: "grok-sales",
    slug: "outreach",
    name: "Outreach Agent",
    icon: Target,
    status: "Launch agent",
    description: "Develops focused offers, lead qualification, and one-message outreach drafts without spam tactics.",
    capabilities: ["Lead qualification", "Offer positioning", "Outreach drafts", "Follow-up planning"],
  },
  {
    id: "grok-analytics",
    slug: "analytics",
    name: "Analytics Agent",
    icon: BarChart3,
    status: "Launch agent",
    description: "Analyzes supplied business data and produces plain-language findings, priorities, and next actions.",
    capabilities: ["Data analysis", "Trend review", "Priority findings", "Action plans"],
  },
]

const deferredAgents = [
  "Customer Support Agent",
  "Technical Support Agent",
  "Automation Builder",
  "SEO Agent",
  "Shopify Agent",
  "Video Agent",
  "Affiliate Agent",
  "Research Agent",
  "Notifier Agent",
  "Android Build Agent",
]

export default function AgentsPage() {
  return (
    <main className="min-h-screen bg-background px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-10">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="space-y-4">
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
              <Sparkles className="mr-2 h-3.5 w-3.5" />
              AMS launch catalog
            </Badge>
            <div>
              <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Three agents. Real access controls.</h1>
              <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
                The first AMS release focuses on Content, Outreach, and Analytics. Customer execution requires sign-in, an active entitlement, available credits, and a configured AI provider.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/grok-chat">Open workspace</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/pricing">View plans</Link>
            </Button>
          </div>
        </div>

        <section className="grid gap-6 lg:grid-cols-3">
          {launchAgents.map((agent) => {
            const Icon = agent.icon
            return (
              <Card key={agent.id} className="border-primary/20 bg-card/80 shadow-lg">
                <CardHeader>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
                      <Icon className="h-6 w-6" />
                    </div>
                    <Badge variant="secondary">{agent.status}</Badge>
                  </div>
                  <CardTitle className="text-xl">{agent.name}</CardTitle>
                  <CardDescription className="leading-6">{agent.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex flex-wrap gap-2">
                    {agent.capabilities.map((capability) => (
                      <Badge key={capability} variant="outline" className="text-xs">
                        {capability}
                      </Badge>
                    ))}
                  </div>
                  <Button asChild className="w-full">
                    <Link href="/grok-chat">Use {agent.name}</Link>
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </section>

        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>What “available” means</CardTitle>
                <CardDescription className="mt-1 leading-6">
                  AMS does not mark an agent active merely because a card exists. The route must authenticate the customer, verify plan access, verify remaining credits, pass the rate limit, and reach the configured provider.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        <section className="space-y-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Deferred catalog</p>
            <h2 className="mt-2 text-3xl font-bold">Coming after the core is proven</h2>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              These roles remain disabled until their integrations and persistent execution paths are verified. They are not counted as working agents today.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {deferredAgents.map((name) => (
              <div key={name} className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/40 p-4">
                <Bot className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="font-medium">{name}</div>
                  <div className="text-xs text-muted-foreground">Not launched</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap gap-3 border-t border-border/70 pt-8">
          <Button asChild variant="outline">
            <Link href="/">Back home</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/billing">Account billing</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
