import { getServerSession } from "next-auth"
import Link from "next/link"
import { redirect } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { authOptions, isCustomerAuthConfigured, isStableCustomerSubject } from "@/lib/auth"
import { getEntitlementSnapshot } from "@/lib/server/entitlements"

export const dynamic = "force-dynamic"

function statusTone(status?: string | null) {
  if (status === "active" || status === "trialing") return "default"
  if (status === "past_due" || status === "canceled") return "destructive"
  return "secondary"
}

type PageProps = {
  searchParams?: Promise<{ session_id?: string }>
}

export default async function BillingSuccessPage({ searchParams }: PageProps) {
  if (!isCustomerAuthConfigured()) redirect("/login?next=/billing/success")

  const session = await getServerSession(authOptions).catch(() => null)
  const subject = session?.user?.customerSubject
  if (!isStableCustomerSubject(subject)) redirect("/login?next=/billing/success")

  const snapshot = await getEntitlementSnapshot(subject).catch(() => null)
  const billingEmail = snapshot?.billingEmail ?? session?.user?.email?.trim().toLowerCase()
  const status = snapshot?.subscriptionStatus ?? "unverified"
  const params = (await searchParams) ?? {}
  const accessEnabled = status === "active" || status === "trialing"

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <Badge variant={statusTone(status)} className="capitalize">
            Checkout returned
          </Badge>
          <h1 className="mt-3 text-3xl font-bold">Billing confirmation</h1>
          <p className="text-muted-foreground">
            Stripe returned to AMS. Access appears only after the signed webhook updates this account’s entitlement record.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Verified account state</CardTitle>
            <CardDescription>{billingEmail ?? "Authenticated customer"}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Subscription state</div>
              <div className="text-xl font-semibold capitalize">{status}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Access</div>
              <div className="text-xl font-semibold">{accessEnabled ? "Enabled" : "Pending verification"}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Plan</div>
              <div className="text-xl font-semibold capitalize">{snapshot?.plan ?? "Unverified"}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Credits</div>
              <div className="text-xl font-semibold">{snapshot?.totalCredits.toLocaleString() ?? "0"}</div>
            </div>
            <div className="rounded-lg border p-4 md:col-span-2">
              <div className="text-sm text-muted-foreground">Stripe session reference</div>
              <div className="break-all text-sm font-semibold">{params.session_id ?? "Not provided"}</div>
            </div>
          </CardContent>
        </Card>

        {!accessEnabled && (
          <Card>
            <CardHeader>
              <CardTitle>Fulfillment pending</CardTitle>
              <CardDescription>
                No access has been granted from the browser redirect alone. Refresh billing after Stripe webhook processing completes.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <div className="flex gap-3">
          <Button asChild>
            <Link href="/billing">Refresh billing</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/grok-chat">Open agents</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
