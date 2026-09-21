import { AmsPublicHeader } from "@/components/ams-public-header"
import { AmsPublicFooter } from "@/components/ams-public-footer"
import Link from "next/link"
import { ArrowRight, Bot, CreditCard, Sparkles } from "lucide-react"

import { BillingActionButton } from "@/components/billing-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { isContentAgentLaunchEnabled } from "@/lib/content-agent-launch"
import { CREDIT_TOPUP_PACKS } from "@/lib/credit-topups"
import { QUICK_MARKETING_AUDIT } from "@/lib/quick-marketing-audit"
import { monthlyCreditsForPlan } from "@/lib/server/entitlements"
import {
  SUBSCRIPTION_INCLUDED_AGENT_COUNT,
  SUBSCRIPTION_INCLUDED_AGENT_NAMES,
} from "@/lib/subscription-agent-catalog"

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
  {
    name: "Nurture Agent",
    price: "$15",
    href: "/nurture-agent",
    description: "Build structured human-reviewed nurture sequences for leads and customers.",
  },
  {
    name: "Product Creator Agent",
    price: "$15",
    href: "/product-creator-agent",
    description: "Turn a product concept into a structured, human-reviewed offer package and launch draft.",
  },
] as const

const SAAS_PLANS = [
  {
    slug: "starter" as const,
    name: "Starter",
    price: "$29",
    credits: monthlyCreditsForPlan("starter"),
    fit: "Best for trying AMS or running a light monthly workload.",
  },
  {
    slug: "growth" as const,
    name: "Growth",
    price: "$79",
    credits: monthlyCreditsForPlan("growth"),
    fit: "Best for an active small business using several agents each week.",
  },
  {
    slug: "pro" as const,
    name: "Pro",
    price: "$149",
    credits: monthlyCreditsForPlan("pro"),
    fit: "Best for larger workloads and frequent agent use across the month.",
  },
]

const REQUEST_OFFERS = [
  {
    id: "social-content-pack",
    name: "Social Content Pack",
    summary: "Content planning and draft support for a defined campaign.",
  },
  {
    id: "website-profile-review",
    name: "Website / Google Profile Review",
    summary: "A focused review of your website and public business profile.",
  },
  {
    id: "business-cleanup-plan",
    name: "Business Cleanup Plan",
    summary: "A practical cleanup plan for offers, homepage messaging, and priorities.",
  },
]

export default function PricingPage() {
  const contentAgentLive = isContentAgentLaunchEnabled()

  return (
    <>
      <AmsPublicHeader />
      <main className="ams-public-page ams-public-page min-h-screen bg-background px-4 py-8 sm:px-6 lg:py-12">
      <div className="mx-auto max-w-6xl space-y-12">
        <header className="space-y-5">
          <div className="max-w-3xl space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Simple pricing</p>
            <h1 className="text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">Choose the simplest way to start.</h1>
            <p className="text-lg leading-8 text-muted-foreground">
              Use the AMS subscription when you want ongoing access to the {SUBSCRIPTION_INCLUDED_AGENT_COUNT} Live agents. Choose the $49 Quick Marketing Audit when you want one focused marketing review without a subscription.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-primary/40 bg-primary/5">
              <CardHeader>
                <CardDescription>Ongoing AI agent access</CardDescription>
                <CardTitle className="text-2xl">{SUBSCRIPTION_INCLUDED_AGENT_COUNT} Live agents from $29/month</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-6 text-muted-foreground">
                  One subscription gives you a shared monthly credit pool across every currently Live AMS subscription agent.
                </p>
                <Button asChild>
                  <Link href="#plans">
                    Compare plans
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardDescription>One-time service</CardDescription>
                <CardTitle className="text-2xl">Quick Marketing Audit — $49</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-6 text-muted-foreground">
                  Get a focused marketing review, specific fixes, stronger copy, and a practical 7-day action plan. No subscription required.
                </p>
                <Button asChild variant="outline">
                  <Link href={QUICK_MARKETING_AUDIT.landingPath}>
                    Get the $49 Audit
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted-foreground">Already a customer?</span>
            <Button asChild variant="ghost" size="sm">
              <Link href="/billing">
                <CreditCard className="mr-2 h-4 w-4" />
                Open account billing
              </Link>
            </Button>
          </div>
        </header>

        {!contentAgentLive ? (
          <Card className="border-amber-500/40 bg-amber-500/10">
            <CardHeader>
              <CardTitle>Subscription checkout is currently paused</CardTitle>
              <CardDescription>
                No subscription payment can start while the shared AI execution gate is disabled. The $49 Quick Marketing Audit remains available.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href={QUICK_MARKETING_AUDIT.landingPath}>Get the $49 Audit</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <section className="space-y-6" id="plans">
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Monthly plans</p>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Same Live agents. Choose your monthly credit pool.</h2>
            <p className="max-w-3xl leading-7 text-muted-foreground">
              Every plan includes {SUBSCRIPTION_INCLUDED_AGENT_NAMES}. One completed generation from any included agent uses one shared credit.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {SAAS_PLANS.map((plan) => (
              <Card key={plan.slug} className={plan.slug === "growth" ? "border-primary shadow-lg" : undefined}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-2xl">{plan.name}</CardTitle>
                    {plan.slug === "growth" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                        <Sparkles className="h-3.5 w-3.5" /> Popular
                      </span>
                    ) : null}
                  </div>
                  <CardDescription>{plan.fit}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <div className="text-4xl font-black">
                      {plan.price}<span className="text-base font-normal text-muted-foreground">/month</span>
                    </div>
                    <p className="mt-2 text-sm font-medium">{plan.credits.toLocaleString()} shared credits / month</p>
                  </div>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>• All {SUBSCRIPTION_INCLUDED_AGENT_COUNT} Live subscription agents</li>
                    <li>• One shared credit per completed generation</li>
                    <li>• Human review and agent guardrails remain in effect</li>
                    <li>• Stripe billing portal access</li>
                  </ul>
                  {contentAgentLive ? (
                    <BillingActionButton label={`Choose ${plan.name}`} endpoint="/api/billing/checkout" plan={plan.slug} />
                  ) : (
                    <div className="space-y-2">
                      <Button type="button" disabled>Checkout paused</Button>
                      <p className="text-xs text-muted-foreground">No payment can be started for this plan.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href="/agents">
                <Bot className="mr-2 h-4 w-4" />
                Browse the Agent Store
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/billing">Existing customer billing</Link>
            </Button>
          </div>
        </section>

        <section className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">One-time option</p>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Not ready for a subscription? Start with the $49 Audit.</h2>
          </div>
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="space-y-3">
                <div className="text-3xl font-black">{QUICK_MARKETING_AUDIT.priceLabel}</div>
                <p className="max-w-3xl leading-7 text-muted-foreground">
                  Delivered {QUICK_MARKETING_AUDIT.deliveryWindow}. You receive {QUICK_MARKETING_AUDIT.deliverables.join(", ")}.
                </p>
              </div>
              <Button asChild size="lg">
                <Link href={QUICK_MARKETING_AUDIT.landingPath}>
                  Buy the $49 Audit
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Need something different?</p>
            <h2 className="text-3xl font-black tracking-tight">Request a scoped service.</h2>
            <p className="max-w-2xl text-muted-foreground">
              These requests do not charge you or start work automatically. They let AMS review the scope first.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {REQUEST_OFFERS.map((offer) => (
              <Card key={offer.id}>
                <CardHeader>
                  <CardTitle className="text-lg">{offer.name}</CardTitle>
                  <CardDescription>{offer.summary}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline" className="w-full">
                    <Link href={`/ethical-agent-farm/request?offer=${offer.id}`}>Request this service</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          <Button asChild variant="ghost">
            <Link href="/ethical-agent-farm/request?offer=monthly-marketing-support">Request ongoing monthly support</Link>
          </Button>
        </section>

        <section className="space-y-4 border-t border-border/70 pt-8">
          <details className="rounded-xl border bg-card p-5">
            <summary className="cursor-pointer font-semibold">Reference: standalone agent rates and credit top-ups</summary>
            <div className="mt-5 space-y-6 text-sm text-muted-foreground">
              <div className="space-y-3">
                <p>
                  Selected Live agents have approved standalone reference rates, but standalone checkout is not currently available. Subscription access uses shared credits.
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
                  {LIVE_AGENT_PRICING.map((agent) => (
                    <div key={agent.name} className="rounded-lg border p-4">
                      <div className="font-semibold text-foreground">{agent.name}</div>
                      <div className="mt-1 text-xl font-bold text-foreground">{agent.price}</div>
                      <div>/ completed run</div>
                      <Link className="mt-3 inline-block text-primary hover:underline" href={agent.href}>View agent</Link>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <p className="font-semibold text-foreground">Subscriber credit top-ups</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {CREDIT_TOPUP_PACKS.map((pack) => (
                    <div key={pack.slug} className="rounded-lg border p-4">
                      <div>{pack.name}</div>
                      <div className="mt-1 text-xl font-bold text-foreground">{pack.priceLabel}</div>
                      <div>One-time purchase · subscribers only</div>
                    </div>
                  ))}
                </div>
                <p>
                  Monthly plan credits are used first. Top-ups are available from web billing and are not offered inside the Android app while Google Play billing requirements remain separate.
                </p>
              </div>
            </div>
          </details>
        </section>
      </div>
    </main>
      <AmsPublicFooter />
    </>
  )
}
