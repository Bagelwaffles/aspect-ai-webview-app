import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getBillingSnapshot } from "@/lib/billing"

export const dynamic = "force-dynamic"

function statusTone(status?: string | null) {
  if (status === "active" || status === "trialing") return "default"
  if (status === "locked" || status === "past_due" || status === "canceled") return "destructive"
  return "secondary"
}

export default async function BillingPage() {
  const snapshot = await getBillingSnapshot()
  const org = snapshot.organization
  const status = org?.subscriptionStatus ?? "locked"

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Billing</h1>
            <p className="text-muted-foreground">Current subscription state for the safe test organization.</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/">Back to dashboard</Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Safe org billing state</CardTitle>
                <CardDescription>{org?.organizationSlug ?? "ams-stripe-test-org"}</CardDescription>
              </div>
              <Badge variant={statusTone(status)} className="capitalize">
                {status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Access</div>
              <div className="text-xl font-semibold">{org?.accessEnabled ? "Enabled" : "Locked"}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Current period end</div>
              <div className="text-xl font-semibold">{org?.currentPeriodEnd ?? "Unavailable"}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Stripe subscription</div>
              <div className="text-xl font-semibold">{org?.stripeSubscriptionId ?? "Not linked"}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Billing backend</div>
              <div className="text-xl font-semibold">
                {snapshot.billingStatus?.ok ? "Configured" : "Status only / blocked"}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Launch blockers</CardTitle>
            <CardDescription>What is still staged or needs attention.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(snapshot.billingStatus?.blockers?.length ?? 0) > 0 ? (
              snapshot.billingStatus?.blockers?.map((blocker) => <div key={blocker}>• {blocker}</div>)
            ) : (
              <div>• No billing blockers reported for the safe org snapshot.</div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button asChild>
            <Link href="/">Return to dashboard</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/billing/success">Review checkout success page</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
