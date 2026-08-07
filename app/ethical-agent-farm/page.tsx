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
              Service workflow launch
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
              One live offer. The rest stay behind the launch gate.
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              The AMS Quick Marketing Audit is now available as a $49 one-time service with Stripe-hosted checkout. Other service concepts remain request-only until their payment and fulfillment paths are verified.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/quick-marketing-audit">
                  Get the $49 audit
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/pricing">View subscription plans</Link>
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
                Every AMS offer must satisfy these rules before customers can buy it.
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
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Service offers</p>
            <h2 className="text-2xl font-bold">Buy the verified offer. Request the rest.</h2>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              Quick Marketing Audit checkout is live through Stripe. The other offers still require human review before scope, price, or delivery is confirmed.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {ETHICAL_OFFERS.map((offer) => {
              const isLiveAudit = offer.id === "quick-marketing-audit"
              return (
                <Card key={offer.id} className={isLiveAudit ? "border-primary/30" : undefined}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <CardTitle>{offer.name}</CardTitle>
                        <CardDescription>{offer.summary}</CardDescription>
                      </div>
                      <Badge variant={isLiveAudit ? "default" : "secondary"}>
                        {isLiveAudit ? "Live" : offer.billingLabel}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-lg font-semibold">{offer.price}</div>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      {offer.deliverables.map((item) => (
                        <li key={item}>- {item}</li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap gap-3">
                      <Button asChild>
                        <Link href={offer.ctaHref}>{offer.cta}</Link>
                      </Button>
                      {!isLiveAudit ? (
                        <Button asChild variant="outline">
                          <Link href="/pricing">View subscriptions</Link>
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Planned roles</p>
            <h2 className="text-2xl font-bold">Roadmap concepts, not active autonomous agents</h2>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              The paid audit is a service with human review and AI assistance. Every role below remains unavailable for autonomous customer execution until it passes production verification.
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
                How the live audit is handled
              </CardTitle>
              <CardDescription>
                A real paid service now, with automation increasing only after proof.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>1. The customer purchases the $49 audit through Stripe-hosted checkout.</p>
              <p>2. Checkout collects the business URL, target customer, and biggest marketing challenge.</p>
              <p>3. AMS reviews the business and prepares the promised deliverables with human oversight.</p>
              <p>4. The completed audit is targeted for delivery within 48 hours.</p>
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardHeader>
              <CardTitle>Launch boundary</CardTitle>
              <CardDescription>What is live and what is not.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Only the Quick Marketing Audit is positioned here as a live one-time paid service. No unfinished agent is represented as autonomous or production-ready.
              </p>
              <Button asChild className="w-full">
                <Link href="/quick-marketing-audit">
                  Get the Quick Marketing Audit
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
