import Link from "next/link"
import { Bot, CreditCard, Sparkles } from "lucide-react"

import { BillingActionButton } from "@/components/billing-actions"
import { EthicalOfferCheckoutButton } from "@/components/ethical-offer-checkout-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const SAAS_PLANS = [
  {
    slug: "starter" as const,
    name: "Starter",
    price: "$29",
    credits: "2,000 credits per month",
    description: "For one business using the three launch agents.",
  },
  {
    slug: "growth" as const,
    name: "Growth",
    price: "$79",
    credits: "8,000 credits per month",
    description: "For businesses producing and testing content every week.",
  },
  {
    slug: "pro" as const,
    name: "Pro",
    price: "$149",
    credits: "20,000 credits per month",
    description: "For heavier agent usage and ongoing campaign execution.",
  },
]

const ETHICAL_OFFERS = [
  {
    id: "quick-marketing-audit",
    name: "Quick Marketing Audit",
    price: "$49",
    summary: "Five priority problems, five fixes, and practical copy examples.",
    deliverables: ["5 problems", "5 fixes", "sample headline", "sample offer", "sample post"],
  },
  {
    id: "social-content-pack",
    name: "Social Content Pack",
    price: "$99",
    summary: "Ready-to-use post ideas, hooks, calls to action, and finished copy.",
    deliverables: ["10 post ideas", "5 ready posts", "CTA set", "light brand angle"],
  },
  {
    id: "website-profile-review",
    name: "Website / Google Profile Review",
    price: "$199",
    summary: "Conversion, clarity, and local trust review with a priority checklist.",
    deliverables: ["site critique", "Google profile notes", "conversion fixes", "priority checklist"],
  },
  {
    id: "business-cleanup-plan",
    name: "Business Cleanup Plan",
    price: "$297",
    summary: "A sharper offer, homepage direction, content priorities, and a seven-day plan.",
    deliverables: ["offer cleanup", "homepage fixes", "content priorities", "next 7-day plan"],
  },
]

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-12">
        <div className="space-y-4">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">AMS pricing</p>
          <h1 className="max-w-3xl text-4xl font-bold sm:text-5xl">Pay for working tools—not fake dashboards.</h1>
          <p className="max-w-2xl text-muted-foreground">
            The launch plans include Content, Outreach, and Analytics agents. Account access is granted only after signed Stripe webhook fulfillment.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href="/grok-chat">
                <Bot className="mr-2 h-4 w-4" />
                Open agents
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
            <h2 className="text-3xl font-bold">Choose monthly agent capacity</h2>
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
                    <li>• {plan.credits}</li>
                    <li>• Content Agent</li>
                    <li>• Outreach Agent</li>
                    <li>• Analytics Agent</li>
                    <li>• Stripe billing portal</li>
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
            <h2 className="text-3xl font-bold">One-time marketing work</h2>
            <p className="max-w-2xl text-muted-foreground">
              These offers use their own configured Stripe prices. When an offer is not configured, the button falls back to the request form instead of pretending checkout worked.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {ETHICAL_OFFERS.map((offer) => (
              <Card key={offer.id}>
                <CardHeader>
                  <CardTitle>{offer.name}</CardTitle>
                  <CardDescription>One-time</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-3xl font-bold">{offer.price}</div>
                  <p className="text-sm text-muted-foreground">{offer.summary}</p>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {offer.deliverables.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                  <EthicalOfferCheckoutButton
                    label="Buy on Stripe"
                    offerSlug={offer.id}
                    fallbackHref={`/ethical-agent-farm/request?offer=${offer.id}`}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Card className="border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle>Need ongoing done-for-you support?</CardTitle>
            <CardDescription>
              Monthly marketing support is handled through a scoped request until its separate recurring Stripe product is verified.
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
