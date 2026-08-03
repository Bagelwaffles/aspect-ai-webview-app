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

type PageProps = {
  searchParams?: Promise<{ session_id?: string }>
}

export default async function BillingSuccessPage({ searchParams }: PageProps) {
  const snapshot = await getBillingSnapshot()
  const organization = snapshot.organization
  const status = organization?.subscriptionStatus ?? "unverified"
  const params = (await searchParams) ?? {}

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <Badge variant={statusTone(status)} className="capitalize">
            Checkout returned
          </Badge>
          <h1 className="mt-3 text-3xl font-bold">Billing confirmation</h1>
          <p className="text-muted-foreground">
            The payment provider returned to AMS. Access is enabled only after verified fulfillment updates the billing record.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Verified billing state</CardTitle>
            <CardDescription>{organization?.organizationSlug ?? "No organization linked"}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Subscription state</div>
              <div className="text-xl font-semibold capitalize">{status}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Access</div>
              <div className="text-xl font-semibold">{organization?.accessEnabled ? "Enabled" : "Not verified"}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Current period end</div>
              <div className="text-xl font-semibold">{organization?.currentPeriodEnd ?? "Unavailable"}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Stripe session reference</div>
              <div className="break-all text-sm font-semibold">{params.session_id ?? "Not provided"}</div>
            </div>
          </CardContent>
        </Card>

        {snapshot.error && (
          <Card>
            <CardHeader>
              <CardTitle>Fulfillment pending</CardTitle>
              <CardDescription>
                AMS could not verify the entitlement record yet. No access has been granted automatically.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <Button asChild>
          <Link href="/billing">Return to billing</Link>
        </Button>
      </div>
    </main>
  )
}
