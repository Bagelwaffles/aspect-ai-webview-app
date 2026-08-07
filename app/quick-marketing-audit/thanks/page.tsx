import Link from "next/link"
import { CheckCircle2, Clock3, Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { QUICK_MARKETING_AUDIT } from "@/lib/quick-marketing-audit"

export const metadata = {
  title: "Payment received | AMS Quick Marketing Audit",
  description: "Next steps after purchasing the AMS Quick Marketing Audit.",
}

export default function QuickMarketingAuditThanksPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Card className="border-primary/30">
          <CardHeader className="space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-3xl">Your AMS audit order is in.</CardTitle>
              <CardDescription className="mt-2 text-base">
                Stripe has completed the checkout flow. AMS will use the business information entered at checkout to begin the review.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-4">
                <Clock3 className="mb-3 h-5 w-5 text-primary" />
                <p className="font-medium">Delivery target</p>
                <p className="mt-1 text-sm text-muted-foreground">Your completed audit is targeted for delivery {QUICK_MARKETING_AUDIT.deliveryWindow}.</p>
              </div>
              <div className="rounded-lg border p-4">
                <Mail className="mb-3 h-5 w-5 text-primary" />
                <p className="font-medium">Watch your checkout email</p>
                <p className="mt-1 text-sm text-muted-foreground">Use the same email address you entered in Stripe for any follow-up about the order.</p>
              </div>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
              If AMS needs anything else before completing the audit, we will contact you using the email from checkout. Keep your website or social page accessible so we can review the current marketing accurately.
            </div>

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
