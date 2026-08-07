import Link from "next/link"
import { ArrowRight, CheckCircle2, Clock3, ShieldCheck, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { QUICK_MARKETING_AUDIT } from "@/lib/quick-marketing-audit"

export const metadata = {
  title: "AMS Quick Marketing Audit | Aspect Marketing Solutions",
  description:
    "Get a focused $49 marketing audit with specific fixes, an improved headline and offer, a promotional post, and a 7-day action plan delivered within 48 hours.",
}

const idealFor = [
  "Local businesses that know their marketing is not converting well enough",
  "Owners who need a clear outside view before spending more on ads",
  "Small teams that need practical next actions instead of another generic report",
]

export default function QuickMarketingAuditPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:px-6 lg:py-16">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              First live AMS revenue offer
            </div>

            <div className="space-y-4">
              <h1 className="max-w-4xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                Find what is costing your marketing attention, leads, and sales.
              </h1>
              <p className="max-w-2xl text-lg text-muted-foreground sm:text-xl">
                The AMS Quick Marketing Audit gives you a focused outside review of your current marketing and a practical plan for what to fix next.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <a href={QUICK_MARKETING_AUDIT.checkoutUrl} rel="noreferrer">
                  Get my audit — $49
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/">Back to AMS</Link>
              </Button>
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-primary" />
                Delivered {QUICK_MARKETING_AUDIT.deliveryWindow}
              </span>
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                One-time purchase. No subscription.
              </span>
            </div>
          </div>

          <Card className="border-primary/30">
            <CardHeader>
              <CardDescription>Launch price</CardDescription>
              <CardTitle className="text-4xl">{QUICK_MARKETING_AUDIT.priceLabel}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="mb-3 text-sm font-medium">You receive:</p>
                <ul className="space-y-3">
                  {QUICK_MARKETING_AUDIT.deliverables.map((item) => (
                    <li className="flex gap-3 text-sm text-muted-foreground" key={item}>
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Button asChild className="w-full" size="lg">
                <a href={QUICK_MARKETING_AUDIT.checkoutUrl} rel="noreferrer">
                  Start the audit
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Secure checkout is handled by Stripe. At checkout we collect the business details needed to begin the review. AMS does not promise specific revenue or ranking outcomes.
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-5 md:grid-cols-3">
          {idealFor.map((item, index) => (
            <Card key={item}>
              <CardHeader>
                <CardDescription>Best fit 0{index + 1}</CardDescription>
                <CardTitle className="text-lg">{item}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>What happens after you buy</CardTitle>
              <CardDescription>A simple delivery process with no fake automation claims.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4 text-sm text-muted-foreground">
                <li><strong className="text-foreground">1. Checkout.</strong> Stripe collects payment and the core business details we need to start.</li>
                <li><strong className="text-foreground">2. Review.</strong> AMS reviews your positioning, offer, website or social presence, and the challenge you identified.</li>
                <li><strong className="text-foreground">3. Build.</strong> We turn the findings into specific fixes, stronger copy, and a 7-day action plan.</li>
                <li><strong className="text-foreground">4. Deliver.</strong> Your completed audit is delivered within 48 hours.</li>
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Why this is the first AMS offer</CardTitle>
              <CardDescription>Useful now, automatable later.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                AMS is bringing its agent platform online in controlled stages. This audit is deliberately simple: buyers get a real deliverable now while the deeper autonomous workflows continue through production verification.
              </p>
              <p>
                That means you are buying the outcome described on this page—not a claim that every historical AMS agent is already autonomous or production-ready.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}
