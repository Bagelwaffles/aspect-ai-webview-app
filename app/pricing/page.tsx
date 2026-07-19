import Link from "next/link"
import { ArrowRight, Bot, CreditCard, ShieldCheck, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BillingActionButton } from "@/components/billing-actions"
import { EthicalOfferCheckoutButton } from "@/components/ethical-offer-checkout-button"

const ETHICAL_OFFERS = [
  {
    id: "quick-marketing-audit",
    name: "Quick Marketing Audit",
    price: "$49",
    billingLabel: "One-time",
    summary: "A fast, practical audit with the top issues and the first fixes that matter.",
    deliverables: ["5 problems", "5 fixes", "sample headline", "sample offer", "sample post"],
    cta: "Buy on Stripe",
    featured: false,
  },
  {
    id: "social-content-pack",
    name: "Social Content Pack",
    price: "$99",
    billingLabel: "One-time",
    summary: "Ready-to-use posts and hooks for a small business that needs consistent content.",
    deliverables: ["10 post ideas", "5 ready posts", "CTA set", "light brand angle"],
    cta: "Buy on Stripe",
    featured: false,
  },
  {
    id: "website-profile-review",
    name: "Website / Google Profile Review",
    price: "$199",
    billingLabel: "One-time",
    summary: "A stronger review that focuses on conversion, clarity, and local trust signals.",
    deliverables: ["site critique", "Google profile notes", "conversion fixes", "priority checklist"],
    cta: "Buy on Stripe",
    featured: false,
  },
  {
    id: "business-cleanup-plan",
    name: "Business Cleanup Plan",
    price: "$297",
    billingLabel: "One-time",
    summary: "A practical cleanup plan for businesses that need sharper positioning and a cleaner funnel.",
    deliverables: ["offer cleanup", "homepage fixes", "content priorities", "next 7-day plan"],
    cta: "Buy on Stripe",
    featured: false,
  },
  {
    id: "monthly-marketing-support",
    name: "Marketing Support",
    price: "$497/month",
    billingLabel: "Monthly",
    summary: "Ongoing support for content, audits, and lightweight marketing execution.",
    deliverables: ["monthly audit", "content support", "offer tuning", "analytics review"],
    cta: "Start support checkout",
    featured: true,
  },
] as const

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Pricing</p>
          <h1 className="text-4xl font-bold">Launch-ready pricing for the AMS platform</h1>
          <p className="max-w-2xl text-muted-foreground">
            Choose a plan, start subscription checkout, and manage billing from the live app without leaving the platform.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href="/ethical-agent-farm">
                <Bot className="mr-2 h-4 w-4" />
                View ethical agent farm
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/products">View products</Link>
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Ethical Agent Farm</p>
            <h2 className="text-2xl font-bold">Pricing for the new agents</h2>
            <p className="max-w-2xl text-muted-foreground">
              One-time agent offers can use Stripe checkout when the corresponding price IDs are configured, and they fall back to request flow when they are not. Monthly support continues through the live Stripe checkout.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {ETHICAL_OFFERS.map((offer) => (
              <Card key={offer.id} className={offer.featured ? "border-primary shadow-sm md:col-span-2 xl:col-span-1" : ""}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <CardTitle>{offer.name}</CardTitle>
                      <CardDescription>{offer.billingLabel}</CardDescription>
                    </div>
                    {offer.featured ? <Sparkles className="h-5 w-5 text-primary" /> : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-4xl font-bold">{offer.price}</div>
                  <p className="text-sm text-muted-foreground">{offer.summary}</p>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {offer.deliverables.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-3">
                    {offer.featured ? (
                      <BillingActionButton label={offer.cta} endpoint="/api/billing/checkout" />
                    ) : (
                      <EthicalOfferCheckoutButton
                        label={offer.cta}
                        offerSlug={offer.id}
                        fallbackHref={`/ethical-agent-farm/request?offer=${offer.id}`}
                      />
                    )}
                    <Button asChild variant="outline">
                      <Link href="/ethical-agent-farm">View details</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Starter</CardTitle>
              <CardDescription>For a single brand and core content workflows.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-4xl font-bold">$49<span className="text-base font-normal text-muted-foreground">/mo</span></div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• Subscription checkout</li>
                <li>• Content Agent access</li>
                <li>• Billing dashboard</li>
              </ul>
              <div className="flex flex-wrap gap-3">
                <BillingActionButton label="Start checkout" endpoint="/api/billing/checkout" />
                <Button asChild variant="outline">
                  <Link href="/billing/success">
                    <CreditCard className="mr-2 h-4 w-4" />
                    Review billing
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Managed</CardTitle>
              <CardDescription>For teams that need billing self-service and support.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-4xl font-bold">$149<span className="text-base font-normal text-muted-foreground">/mo</span></div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• Everything in Starter</li>
                <li>• Billing portal access</li>
                <li>• Plan and payment updates</li>
              </ul>
              <div className="flex flex-wrap gap-3">
                <BillingActionButton label="Manage subscription" endpoint="/api/billing/portal" variant="outline" />
                <Button asChild variant="ghost">
                  <Link href="/">
                    <Sparkles className="mr-2 h-4 w-4" />
                    Back to dashboard
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
