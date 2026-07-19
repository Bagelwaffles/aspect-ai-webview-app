import Link from "next/link"
import { ArrowRight, BadgeCheck, Bot, ShieldCheck, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BillingActionButton } from "@/components/billing-actions"
import { ETHICAL_AGENT_ROLES, ETHICAL_OFFERS, FARM_OPERATING_RULES } from "@/lib/ethical-agent-farm"

export default function EthicalAgentFarmPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-10">
        <section className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="space-y-4">
            <Badge variant="outline" className="w-fit">
              Ethical Agent Farm
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
              Human-approved agents that sell useful work, not noise.
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              Aspect Marketing Solutions uses a small agent farm to create audits, content, offer drafts, and support packages that help real businesses move faster.
            </p>
            <div className="flex flex-wrap gap-3">
              <BillingActionButton label="Start support checkout" endpoint="/api/billing/checkout" />
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
                Compliance-first by design
              </CardTitle>
              <CardDescription>
                Every draft must pass human approval and the compliance gate before it goes out.
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
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Sellable offers</p>
            <h2 className="text-2xl font-bold">Simple offers the farm can sell right away</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {ETHICAL_OFFERS.map((offer) => (
              <Card key={offer.id} className={offer.featured ? "border-primary shadow-sm" : ""}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <CardTitle>{offer.name}</CardTitle>
                      <CardDescription>{offer.summary}</CardDescription>
                    </div>
                    {offer.featured ? <Badge>Featured</Badge> : <Badge variant="secondary">{offer.billingLabel}</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end gap-2">
                    <div className="text-4xl font-bold">{offer.price}</div>
                    <div className="pb-1 text-sm text-muted-foreground">{offer.billingLabel}</div>
                  </div>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {offer.deliverables.map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-3">
                    {offer.featured ? (
                      <BillingActionButton label={offer.cta} endpoint="/api/billing/checkout" />
                    ) : (
                      <Button asChild>
                        <Link href={`/ethical-agent-farm/offers/${offer.id}`}>{offer.cta}</Link>
                      </Button>
                    )}
                    <Button asChild variant="outline">
                      <Link href="/pricing">Compare pricing</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Agent system</p>
            <h2 className="text-2xl font-bold">The nine agents behind the offers</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {ETHICAL_AGENT_ROLES.map((agent) => (
              <Card key={agent.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Bot className="h-5 w-5 text-primary" />
                    {agent.name}
                  </CardTitle>
                  <CardDescription>{agent.summary}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="mb-2 text-sm font-medium">Responsibilities</p>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {agent.responsibilities.map((item) => (
                        <li key={item}>- {item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium">Guardrails</p>
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
                How it sells
              </CardTitle>
              <CardDescription>
                The system is designed to win business by being useful, specific, and easy to buy.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>1. Research a public business that clearly needs help.</p>
              <p>2. Draft a useful mini-audit with concrete fixes.</p>
              <p>3. Run the compliance check.</p>
              <p>4. Get human approval.</p>
              <p>5. Send manually or publish the approved content.</p>
              <p>6. Track replies and sales in the revenue tracker.</p>
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardHeader>
              <CardTitle>Revenue target</CardTitle>
              <CardDescription>Operating benchmark only.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-4xl font-bold">$100/day</div>
              <p className="text-sm text-muted-foreground">
                The point is steady, ethical revenue from useful work, not hype, spam, or shortcuts.
              </p>
              <Button asChild className="w-full">
                <Link href="/billing">
                  Open billing
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
