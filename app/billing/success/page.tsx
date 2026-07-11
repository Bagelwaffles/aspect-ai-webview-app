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

export default async function BillingSuccessPage({
  searchParams
}: {
  searchParams?: { session_id?: string }
}) {
  const snapshot = await getBillingSnapshot()
  const org = snapshot.organization
  const status = org?.subscriptionStatus ?? "locked"
  const params = searchParams ?? {}

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <Badge variant={statusTone(status)} className="capitalize">
            Checkout complete
          </Badge>
          <h1 className="mt-3 text-3xl font-bold">Billing success</h1>
          <p className="text-muted-foreground">
            The checkout return route is live and now resolves to a real billing state view.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Safe org status</CardTitle>
            <CardDescription>{org?.organizationSlug ?? "ams-stripe-test-org"}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Subscription state</div>
              <div className="text-xl font-semibold capitalize">{status}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Access</div>
              <div className="text-xl font-semibold">{org?.accessEnabled ? "Enabled" : "Locked"}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Current period end</div>
              <div className="text-xl font-semibold">{org?.currentPeriodEnd ?? "Unavailable"}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Stripe session</div>
              <div className="text-xl font-semibold">{params.session_id ?? "No session id in return URL"}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Next step</CardTitle>
            <CardDescription>
              Return to the dashboard now that the checkout return route is working.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/">Back to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
