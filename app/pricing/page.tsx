import Link from "next/link"
import { ArrowRight, Bot, CreditCard, Sparkles } from "lucide-react"

import { BillingActionButton } from "@/components/billing-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { isContentAgentLaunchEnabled } from "@/lib/content-agent-launch"
import { CREDIT_TOPUP_PACKS } from "@/lib/credit-topups"
import { QUICK_MARKETING_AUDIT } from "@/lib/quick-marketing-audit"
import { monthlyCreditsForPlan } from "@/lib/server/entitlements"

const LIVE_AGENT_PRICING = [
  {
    name: "Content Agent",
    price: "$12",
    href: "/content-agent",
    description: "Create practical marketing copy, product descriptions, email drafts, and social content.",
  },
  {
    name: "Lead Magnet Agent",
    price: "$15",
    href: "/lead-magnet-agent",
    description: "Turn a defined audience problem into a useful lead magnet and conversion asset.",
  },
  {
    name: "Outreach Agent",
    price: "$15",
    href: "/outreach-agent",
    description: "Create one human-reviewed prospect or follow-up message from customer-supplied context.",
  },
  {
    name: "SEO Agent",
    price: "$15",
    href: "/seo-agent",
    description: "Build a practical on-page SEO brief with search intent, metadata, structure, and linking direction.",
  },
  {
    name: "Email Campaign Agent",
    price: "$15",
    href: "/email-campaign-agent",
    description: "Build a human-reviewed 3, 5, or 7-email campaign sequence from your supplied inputs.",
  },
] as const

const SAAS_PLANS = [
  {
    slug: "starter" as const,
    name: "Starter",
    price: "$29",
    credits: monthlyCreditsForPlan("starter"),
    description: "Entry access to the verified AMS marketing-agent suite with a shared monthly credit pool.",
  },
  {
    slug: "growth" as const,
    name: "Growth",
    price: "$79",
    credits: monthlyCreditsForPlan("growth"),
    description: "More shared monthly generation capacity across the verified AMS marketing-agent suite.",
  },
  {
    slug: "pro" as const,
    name: "Pro",
    price: "$149",
    credits: monthlyCreditsForPlan("pro"),
    description: "The largest standard shared monthly generation pool for verified AMS marketing workflows.",
  },
]

const REQUEST_OFFERS = [
  {
    id: "social-content-pack",
    name: "Social Content Pack",
    summary: "A proposed content scope for human review before any work begins.",
    deliverables: ["10 post ideas", "5 draft posts", "CTA set", "light brand angle"],
  },
  {
    id: "website-profile-review",
    name: "Website / Google Profile Review",
    summary: "A proposed website and profile review scope for human review.",
    deliverables: ["site critique", "Google profile notes", "conversion fixes", "priority checklist"],
  },
  {
    id: "business-cleanup-plan",
    name: "Business Cleanup Plan",
    summary: "A proposed cleanup-plan scope for human review before any work begins.",
    deliverables: ["offer cleanup", "homepage fixes", "content priorities", "next 7-day plan"],
  },
]

export default function PricingPage() {
  const contentAgentLive = isContentAgentLaunchEnabled()

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-12">
        <div className="space-y-4">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">AMS pricing</p>
          <h1 className="max-w-3xl text-4xl font-bold sm:text-5xl">Clear offers with honest launch status.</h1>
          <p className="max-w-2xl text-muted-foreground">
            {contentAgentLive
              ? "Use a Live AMS marketing agent from $12 per completed standalone run, or subscribe from $29/month for shared credits across all five production-verified marketing agents."
              : "The $49 Quick Marketing Audit is live now. Standalone agent rates are published for transparency, while paid AI checkout remains paused until the shared production execution gate is deliberately enabled."}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href={QUICK_MARKETING_AUDIT.landingPath}>
                Get the $49 audit
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/agents">
                <Bot className="mr-2 h-4 w-4" />
                View agent status
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/billing">
                <CreditCard className="mr-2 h-4 w-4" />
                Account billing
              </Link>
            </Button>
          </div>
        </div>

        {!contentAgentLive ? (
          <Card className="border-amber-500/40 bg-amber-500/10">
            <CardHeader>
              <CardTitle>Paid AI checkout is paused</CardTitle>
              <CardDescription>
                The rates below are the approved standalone prices for the five Live agents, but no standalone or subscription payment can start while the shared AI execution gate is disabled. This does not affect the live one-time Quick Marketing Audit.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/agents">View verified Live agents</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <section className="space-y-5">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Live service</p>
            <h2 className="text-3xl font-bold">Start with a focused marketing win</h2>
            <p className="max-w-2xl text-muted-foreground">
              Buy the Quick Marketing Audit now through secure Stripe Checkout. This is a one-time service, not an AI subscription.
            </p>
          </div>
          <Card className="border-primary/40 bg-primary/5">
            <CardHeader>
              <CardDescription>Available now · delivered {QUICK_MARKETING_AUDIT.deliveryWindow}</CardDescription>
              <CardTitle className="flex flex-wrap items-end gap-3 text-2xl">
                {QUICK_MARKETING_AUDIT.name}
                <span className="text-4xl">{QUICK_MARKETING_AUDIT.priceLabel}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
              <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                {QUICK_MARKETING_AUDIT.deliverables.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
              <Button asChild size="lg">
                <Link href={QUICK_MARKETING_AUDIT.landingPath}>
                  Buy the audit — $49
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-5" id="live-agent-pricing">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Standalone Live-agent pricing</p>
            <h2 className="text-3xl font-bold">Pay for one completed run, or subscribe for better value.</h2>
            <p className="max-w-3xl text-sm text-muted-foreground">
              These are the approved pay-as-you-go rates for customers who want a single completed generation without committing to a subscription. Subscribers do not pay these standalone rates; each completed generation instead uses one shared plan credit.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {LIVE_AGENT_PRICING.map((agent) => (
              <Card key={agent.name} className="flex flex-col">
                <CardHeader>
                  <CardDescription>Live · production verified</CardDescription>
                  <CardTitle className="text-xl">{agent.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <div>
                    <span className="text-3xl font-bold">{agent.price}</span>
                    <span className="text-sm text-muted-foreground"> / completed run</span>
                  </div>
                  <p className="flex-1 text-sm text-muted-foreground">{agent.description}</p>
                  <p className="text-xs text-muted-foreground">Included with subscriber shared credits.</p>
                  <Button asChild variant="outline">
                    <Link href={agent.href}>View agent</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="space-y-5" id="plans">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">SaaS plans</p>
            <h2 className="text-3xl font-bold">One subscription. Five Live marketing agents.</h2>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Every standard plan includes Content Agent, Lead Magnet Agent, Outreach Agent, SEO Agent, and Email Campaign Agent. Subscribers do not pay the standalone per-run rate: one completed generation from any included agent uses one shared credit.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {SAAS_PLANS.map((plan) => (
              <Card key={plan.slug} className={plan.slug === "growth" ? "border-primary shadow-lg" : undefined}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>{plan.name}</CardTitle>
                    {plan.slug === "growth" && <Sparkles className="h-5 w-5 text-primary" />}
                  </div>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="text-4xl font-bold">
                    {plan.price}
                    <span className="text-base font-normal text-muted-foreground">/month</span>
                  </div>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>- {plan.credits.toLocaleString()} shared AI generation credits per month</li>
                    <li>- All 5 currently Live marketing agents included</li>
                    <li>- One completed generation from any included agent uses one shared credit</li>
                    <li>- No standalone per-run charge while using plan credits</li>
                    <li>- Human review and each agent&apos;s delivery guardrails remain in effect</li>
                    <li>- New agents are added only after production verification</li>
                    <li>- Stripe billing portal for existing subscribers</li>
                  </ul>
                  {contentAgentLive ? (
                    <BillingActionButton label={`Choose ${plan.name}`} endpoint="/api/billing/checkout" plan={plan.slug} />
                  ) : (
                    <div className="space-y-2">
                      <Button type="button" disabled>Private beta — checkout paused</Button>
                      <p className="text-xs text-muted-foreground">No payment can be started for this plan.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Need more credits without changing plans?</CardTitle>
              <CardDescription>
                Active subscribers can buy one-time shared-credit top-ups from the web billing portal.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                {CREDIT_TOPUP_PACKS.map((pack) => (
                  <div key={pack.slug} className="rounded-lg border p-4">
                    <div className="text-sm text-muted-foreground">{pack.name}</div>
                    <div className="mt-1 text-2xl font-bold">{pack.priceLabel}</div>
                    <div className="mt-2 text-xs text-muted-foreground">One-time purchase · subscriber-only</div>
                  </div>
                ))}
              </div>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Purchased top-up credits remain available until consumed unless the payment is refunded or reversed. Monthly plan credits are used first. Top-up checkout is available on the web and is not offered inside the Android app while Google Play billing requirements are handled separately.
              </p>
              <Button asChild variant="outline">
                <Link href="/billing">Open account billing</Link>
              </Button>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-5">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Request-based services</p>
            <h2 className="text-3xl font-bold">Need a different scope?</h2>
            <p className="max-w-2xl text-muted-foreground">
              These services remain request-only. Submitting a request does not charge you, start work, or guarantee availability.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {REQUEST_OFFERS.map((offer) => (
              <Card key={offer.id}>
                <CardHeader>
                  <CardTitle>{offer.name}</CardTitle>
                  <CardDescription>Request-only</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-lg font-semibold">No payment accepted</div>
                  <p className="text-sm text-muted-foreground">{offer.summary}</p>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {offer.deliverables.map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                  <Button asChild>
                    <Link href={`/ethical-agent-farm/request?offer=${offer.id}`}>Request this service</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Card className="border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle>Need ongoing done-for-you support?</CardTitle>
            <CardDescription>
              Monthly marketing support is request-only. Submitting the form does not collect payment, start work, or guarantee availability.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/ethical-agent-farm/request?offer=monthly-marketing-support">Request monthly support</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
