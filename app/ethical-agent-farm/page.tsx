import Link from "next/link"
import { ArrowRight, BadgeCheck, Bot, ShieldCheck, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ETHICAL_AGENT_ROLES, ETHICAL_OFFERS, FARM_OPERATING_RULES } from "@/lib/ethical-agent-farm"

export default function EthicalAgentFarmPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-10">
        <section className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="space-y-4">
            <Badge variant="outline" className="w-fit">
              Service workflow roadmap
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
              Planned service workflows with human review.
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              These service concepts are request-only at launch. Submitting a request does not collect payment, start work, or indicate that an automated agent is available.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/pricing">View subscription plans</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/billing">
                  View billing state
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/agents">Inspect agents</Link>
              </Button>
            </div>
          </div>

          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Launch guardrails
              </CardTitle>
              <CardDescription>
                Any future workflow must satisfy these rules before AMS makes it available.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              {FARM_OPERATING_RULES.map((rule) => (
                <div key={rule} className="flex items-start gap-2">
                  <BadgeCheck className="mt-0.5 h-4 w-4 text-primary" />
                  <span>{rule}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Request-only services</p>
            <h2 className="text-2xl font-bold">Service briefs for human review</h2>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              No payment is accepted for these services in the app. Scope, price, availability, and delivery must be confirmed separately before any work begins.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {ETHICAL_OFFERS.map((offer) => (
              <Card key={offer.id}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <CardTitle>{offer.name}</CardTitle>
                      <CardDescription>Requested scope is reviewed by a human before availability or delivery is confirmed.</CardDescription>
                    </div>
                    <Badge variant="secondary">Request only</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-lg font-semibold">No payment accepted</div>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {offer.deliverables.map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-3">
                    <Button asChild>
                      <Link href={`/ethical-agent-farm/request?offer=${offer.id}`}>Request review</Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link href="/pricing">View subscriptions</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Planned roles</p>
            <h2 className="text-2xl font-bold">Roadmap concepts, not active agents</h2>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              Content is the first intended launch agent and remains in progress. Every role below is unavailable for customer execution.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {ETHICAL_AGENT_ROLES.map((agent) => (
              <Card key={agent.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Bot className="h-5 w-5 text-primary" />
                    {agent.name}
                  </CardTitle>
                  <CardDescription>This role is a planning reference and is not available.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="mb-2 text-sm font-medium">Planned responsibilities</p>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {agent.responsibilities.map((item) => (
                        <li key={item}>- {item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium">Required guardrails</p>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {agent.guardrails.map((item) => (
                        <li key={item}>- {item}</li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                How a service request is handled
              </CardTitle>
              <CardDescription>
                This is a human review path, not an automated sale or fulfillment claim.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>1. A customer submits a request without payment.</p>
              <p>2. A human reviews scope, availability, and delivery expectations.</p>
              <p>3. AMS provides next steps only after that review.</p>
              <p>4. No automated outreach, purchase, or fulfillment is implied.</p>
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardHeader>
              <CardTitle>Launch boundary</CardTitle>
              <CardDescription>What this page does and does not offer.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This page accepts service requests only. It does not accept payment, promise revenue, start automated work, or represent unfinished agents as active.
              </p>
              <Button asChild className="w-full">
                <Link href="/ethical-agent-farm/request">
                  Submit a request
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}
