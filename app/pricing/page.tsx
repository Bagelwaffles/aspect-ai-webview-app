import Link from "next/link"
import { Bot, CreditCard, Sparkles } from "lucide-react"

import { BillingActionButton } from "@/components/billing-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const SAAS_PLANS = [
  {
    slug: "starter" as const,
    name: "Starter",
    price: "$29",
    credits: "2,000 credits per month",
    description: "Account access and a monthly credit allocation for future verified workflows.",
  },
  {
    slug: "growth" as const,
    name: "Growth",
    price: "$79",
    credits: "8,000 credits per month",
    description: "Additional monthly capacity while the first verified workflow is completed.",
  },
  {
    slug: "pro" as const,
    name: "Pro",
    price: "$149",
    credits: "20,000 credits per month",
    description: "Higher monthly capacity for future verified workflow usage.",
  },
]

const ETHICAL_OFFERS = [
  {
    id: "quick-marketing-audit",
    name: "Quick Marketing Audit",
    summary: "A proposed audit scope for human review before any work begins.",
    deliverables: ["5 problems", "5 fixes", "sample headline", "sample offer", "sample post"],
  },
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
  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-12">
        <div className="space-y-4">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">AMS pricing</p>
          <h1 className="max-w-3xl text-4xl font-bold sm:text-5xl">Clear subscriptions with honest launch status.</h1>
          <p className="max-w-2xl text-muted-foreground">
            Content is the first intended launch agent, but its real execution flow is still in progress. Outreach, Analytics, and every other agent remain unavailable and are not included as working features in these plans.
          </p>
          <div className="flex flex-wrap gap-3">
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

        <section className="space-y-5">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">SaaS plans</p>
            <h2 className="text-3xl font-bold">Choose monthly account capacity</h2>
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
                    <li>- {plan.credits}</li>
                    <li>- Content Agent status access; execution is still in progress</li>
                    <li>- Outreach, Analytics, and other agents are unavailable</li>
                    <li>- Stripe billing portal</li>
                  </ul>
                  <BillingActionButton label={`Choose ${plan.name}`} endpoint="/api/billing/checkout" plan={plan.slug} />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="space-y-5">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Done-for-you services</p>
            <h2 className="text-3xl font-bold">Scoped marketing requests</h2>
            <p className="max-w-2xl text-muted-foreground">
              One-time checkout is disabled for launch. Submit a request for review; the form does not charge you or claim that work has started.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {ETHICAL_OFFERS.map((offer) => (
              <Card key={offer.id}>
                <CardHeader>
                  <CardTitle>{offer.name}</CardTitle>
                  <CardDescription>Request-only at launch</CardDescription>
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
