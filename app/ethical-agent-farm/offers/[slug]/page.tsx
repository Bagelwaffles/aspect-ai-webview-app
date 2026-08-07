import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getEthicalOfferPage } from "@/lib/ethical-agent-farm-offers"

type PageProps = {
  params: Promise<{ slug: string }>
}

export default async function OfferPage({ params }: PageProps) {
  const { slug } = await params
  const offer = getEthicalOfferPage(slug)

  if (!offer) notFound()

  const isSubscriptionOffer = offer.slug === "monthly-marketing-support"
  const isPaidQuickAudit = offer.slug === "quick-marketing-audit"

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Ethical Agent Farm</p>
          <h1 className="text-4xl font-bold tracking-tight">{offer.name}</h1>
          <p className="max-w-2xl text-muted-foreground">
            {offer.ethicalNote}{" "}
            {isSubscriptionOffer
              ? "Choose an AMS subscription plan through the verified recurring checkout flow."
              : isPaidQuickAudit
                ? "This is a live one-time service offer. Secure payment is handled on Stripe Checkout before AMS begins the audit."
                : "This scoped service is request-only at launch. Submitting the intake form does not charge you."}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>{offer.name}</span>
              <span className="text-xl sm:text-2xl">{offer.price}</span>
            </CardTitle>
            <CardDescription>{offer.deliveryExpectation}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">Who it is for</div>
                <div className="mt-1 font-medium">{offer.whoItIsFor}</div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">Delivery expectation</div>
                <div className="mt-1 font-medium">{offer.deliveryExpectation}</div>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">What the buyer gets</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {offer.buyerGets.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  Ethical note: no spam, no fake claims, no privacy abuse, no guaranteed revenue results.
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {isSubscriptionOffer ? (
                <Button asChild>
                  <Link href="/pricing">
                    View subscription plans
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href={offer.requestPath}>
                    {offer.ctaLabel}
                    {isPaidQuickAudit ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
                  </Link>
                </Button>
              )}
              <Button asChild variant="outline">
                <Link href="/ethical-agent-farm">Back to agent farm</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
