import Link from "next/link"
import { ArrowRight, CreditCard, ShieldCheck, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BillingActionButton } from "@/components/billing-actions"

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
