import { Suspense } from "react"
import Link from "next/link"
import { CheckCircle2, Clock3, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { QUICK_MARKETING_AUDIT } from "@/lib/quick-marketing-audit"

import { QuickAuditResultClient } from "./QuickAuditResultClient"

export const metadata = {
  title: "Payment received | AMS Quick Marketing Audit",
  description: "Verified result delivery after purchasing the AMS Quick Marketing Audit.",
}

export default function QuickMarketingAuditThanksPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-8">
        <Card className="border-primary/30">
          <CardHeader className="space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-3xl">Your AMS audit order is in.</CardTitle>
              <CardDescription className="mt-2 text-base">
                AMS verifies the Stripe payment before showing any customer audit result. The result below is tied to this checkout session and is never created by this page itself.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-4">
                <Clock3 className="mb-3 h-5 w-5 text-primary" />
                <p className="font-medium">Delivery target</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  The native AMS path is designed to make the result available here after fulfillment completes. The published service target remains {QUICK_MARKETING_AUDIT.deliveryWindow}.
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <ShieldCheck className="mb-3 h-5 w-5 text-primary" />
                <p className="font-medium">No second charge</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Refreshing or checking this page reads the existing paid order. It does not create another Stripe Checkout Session or another payment.
                </p>
              </div>
            </div>

            <Suspense fallback={<div className="rounded-lg border p-4 text-sm text-muted-foreground">Loading verified audit status…</div>}>
              <QuickAuditResultClient />
            </Suspense>

            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/">Return to Aspect Marketing Solutions</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/quick-marketing-audit">Review what is included</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
