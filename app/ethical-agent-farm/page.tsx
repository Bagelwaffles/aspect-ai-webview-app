import { AmsPublicHeader } from "@/components/ams-public-header"
import { AmsPublicFooter } from "@/components/ams-public-footer"
import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, BadgeCheck, Bot, ClipboardCheck, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ETHICAL_OFFERS, FARM_OPERATING_RULES } from "@/lib/ethical-agent-farm"
import { SUBSCRIPTION_INCLUDED_AGENTS } from "@/lib/subscription-agent-catalog"

export const metadata: Metadata = {
  title: "AMS Services | Aspect Marketing Solutions",
  description:
    "See verified Aspect Marketing Solutions offers: seven Live shared-credit AI agents, the $49 Quick Marketing Audit, and scoped services available by human-reviewed request.",
}

const requestOnlyOffers = ETHICAL_OFFERS.filter((offer) => offer.billingLabel === "Request only")

export default function EthicalAgentFarmPage() {
  return (
    <>
      <AmsPublicHeader />
      <main className="ams-public-page min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-10">
        <section className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="space-y-4">
            <Badge variant="outline" className="w-fit">
              Verified AMS services
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
              Buy what is live. Request what still needs human scoping.
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              AMS currently offers seven production-verified subscription agents plus the $49 Quick Marketing Audit. Additional service packages remain request-only until scope, price, and delivery are reviewed by a person.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/pricing#plans">
                  Compare plans
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/quick-marketing-audit">Get the $49 audit</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/agents#catalog">Browse the Agent Store</Link>
              </Button>
            </div>
          </div>

          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Operating guardrails
              </CardTitle>
              <CardDescription>
                These rules still apply as AMS expands what customers can buy and request.
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

        <section className="grid gap-6 lg:grid-cols-2">
          <Card className="border-primary/30">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardDescription>Subscription</CardDescription>
                  <CardTitle>7 Live AI agents</CardTitle>
                </div>
                <Badge>Available now</Badge>
              </div>
              <CardDescription className="leading-6">
                Included in AMS shared-credit subscription plans starting at $29/month. One completed generation uses one shared plan credit.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {SUBSCRIPTION_INCLUDED_AGENTS.map((agent) => (
                  <Link
                    key={agent.slug}
                    href={`/agents/${agent.slug}`}
                    className="flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm font-medium hover:border-primary/50 hover:text-primary"
                  >
                    <Bot className="h-4 w-4" />
                    {agent.name}
                  </Link>
                ))}
              </div>
              <Button asChild className="w-full">
                <Link href="/pricing#plans">
                  Choose an AMS plan <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-primary/30">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardDescription>One-time service</CardDescription>
                  <CardTitle>Quick Marketing Audit</CardTitle>
                </div>
                <Badge>Public paid service</Badge>
              </div>
              <CardDescription className="leading-6">
                A focused $49 audit with five problems, five fixes, stronger messaging, one promotional post, and a practical 7-day action plan. Delivery is targeted within 48 hours.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href="/quick-marketing-audit">
                  Get my audit — $49 <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Scoped services</p>
            <h2 className="text-2xl font-bold">Request human review before anything is sold.</h2>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              These service packages are not instant purchases. Submit the business context, then AMS reviews the request before confirming scope, price, or delivery.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {requestOnlyOffers.map((offer) => (
              <Card key={offer.id}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <CardTitle>{offer.name}</CardTitle>
                      <CardDescription>{offer.summary}</CardDescription>
                    </div>
                    <Badge variant="secondary">Request only</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-lg font-semibold">{offer.price}</div>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {offer.deliverables.map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                  <Button asChild className="w-full">
                    <Link href={offer.ctaHref}>{offer.cta}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-primary" />
                Clear purchase boundaries
              </CardTitle>
              <CardDescription>No roadmap theater mixed into the checkout path.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Subscription buyers get access to the seven agents currently marked Live in the canonical AMS catalog.</p>
              <p>The Quick Marketing Audit remains a separate $49 one-time service.</p>
              <p>Request-only services require human review and do not collect payment on the request page.</p>
              <p>Beta, Setup Required, Blocked, and Planned agents remain visible in the Agent Store without being sold as finished products.</p>
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardHeader>
              <CardTitle>Need the full roadmap?</CardTitle>
              <CardDescription>The Agent Store is the source of truth for current lifecycle status.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Use the canonical Agent Store to compare what is Live now with controlled Beta, Setup Required, Blocked, and Planned capabilities.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link href="/agents#catalog">
                  Browse the Agent Store <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
      <AmsPublicFooter />
    </>
  )
}
