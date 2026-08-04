import Link from "next/link"
import { Bot, FileText, LockKeyhole, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const intendedLaunchAgent = {
  name: "Content Agent",
  status: "In progress",
  description: "The first intended AMS launch agent. Its real persisted execution flow is not implemented yet.",
  plannedCapabilities: ["Marketing copy", "Product descriptions", "Email drafts", "Social content"],
}

const unavailableAgents = [
  {
    name: "Outreach Agent",
    detail: "Lead qualification, offer positioning, and outreach drafting remain unavailable.",
  },
  {
    name: "Analytics Agent",
    detail: "Data analysis, reporting, and recommendation workflows remain unavailable.",
  },
  {
    name: "Sales Agent",
    detail: "Sales qualification and recommendation workflows remain unavailable.",
  },
  {
    name: "Customer Support Agent",
    detail: "Customer support execution and integrations remain unavailable.",
  },
  {
    name: "Technical Support Agent",
    detail: "Technical support execution and integrations remain unavailable.",
  },
]

const deferredAgents = [
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
              AMS agent roadmap
            </Badge>
            <div>
              <h1 className="text-4xl font-black tracking-tight sm:text-5xl">One intended launch agent. Still in progress.</h1>
              <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
                Content is the first intended AMS launch agent, but it is not complete or available for customer execution. Outreach, Analytics, Sales, Support, Technical, and the rest of the roadmap remain unavailable.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/content-agent">View Content status</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/pricing">View plans</Link>
            </Button>
          </div>
        </div>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_1.9fr]">
          <Card className="border-primary/20 bg-card/80 shadow-lg">
            <CardHeader>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <FileText className="h-6 w-6" />
                </div>
                <Badge variant="secondary">{intendedLaunchAgent.status}</Badge>
              </div>
              <CardTitle className="text-xl">{intendedLaunchAgent.name}</CardTitle>
              <CardDescription className="leading-6">{intendedLaunchAgent.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="mb-2 text-sm font-medium">Planned capabilities</p>
                <div className="flex flex-wrap gap-2">
                  {intendedLaunchAgent.plannedCapabilities.map((capability) => (
                    <Badge key={capability} variant="outline" className="text-xs">
                      {capability}
                    </Badge>
                  ))}
                </div>
              </div>
              <Button asChild className="w-full">
                <Link href="/content-agent">View implementation status</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Unavailable agents</CardTitle>
              <CardDescription>These roles are not active, executable, or included as working subscription features.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {unavailableAgents.map((agent) => (
                <div key={agent.name} className="rounded-lg border border-border/70 bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{agent.name}</span>
                    <Badge variant="outline">Unavailable</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{agent.detail}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Availability boundary</CardTitle>
                <CardDescription className="mt-1 leading-6">
                  A page, catalog entry, subscription, or provider configuration does not make an agent available. AMS will mark an agent ready only after its authenticated execution, credit handling, persistence, failure paths, and customer experience are verified.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        <section className="space-y-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Deferred catalog</p>
            <h2 className="mt-2 text-3xl font-bold">Unavailable until verified</h2>
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
                  <div className="text-xs text-muted-foreground">In progress - not available</div>
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
