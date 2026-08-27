import { getServerSession } from "next-auth"
import Link from "next/link"
import { redirect } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { authOptions, isCustomerAuthConfigured, isStableCustomerSubject } from "@/lib/auth"
import { getEntitlementSnapshot } from "@/lib/server/entitlements"

export const dynamic = "force-dynamic"

type PageProps = {
  searchParams?: Promise<{ session_id?: string }>
}

export default async function CreditTopupSuccessPage({ searchParams }: PageProps) {
  if (!isCustomerAuthConfigured()) redirect("/login?next=/billing/topup/success")

  const session = await getServerSession(authOptions).catch(() => null)
  const subject = session?.user?.customerSubject
  if (!isStableCustomerSubject(subject)) redirect("/login?next=/billing/topup/success")

  const snapshot = await getEntitlementSnapshot(subject).catch(() => null)
  const balanceVerified = Boolean(snapshot?.configured)
  const params = (await searchParams) ?? {}

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <Badge>Checkout returned</Badge>
          <h1 className="mt-3 text-3xl font-bold">Credit top-up confirmation</h1>
          <p className="text-muted-foreground">
            Stripe returned to AMS. Purchased credits are granted only after the signed Stripe webhook verifies the paid session.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{balanceVerified ? "Current verified credit balance" : "Credit balance verification pending"}</CardTitle>
            <CardDescription>
              {balanceVerified
                ? "Refresh billing if the payment just completed and the webhook is still processing."
                : "AMS could not verify the credit ledger on this request. No zero balance is being assumed. Refresh billing to check again."}
            </CardDescription>
          </CardHeader>
          {balanceVerified && snapshot ? (
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">Plan credits</div>
                <div className="text-xl font-semibold">{snapshot.planCredits.toLocaleString()}</div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">Top-up credits</div>
                <div className="text-xl font-semibold">{snapshot.topupCredits.toLocaleString()}</div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">Total credits</div>
                <div className="text-xl font-semibold">{snapshot.totalCredits.toLocaleString()}</div>
              </div>
              <div className="rounded-lg border p-4 md:col-span-3">
                <div className="text-sm text-muted-foreground">Stripe session reference</div>
                <div className="break-all text-sm font-semibold">{params.session_id ?? "Not provided"}</div>
              </div>
            </CardContent>
          ) : (
            <CardContent>
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">Stripe session reference</div>
                <div className="break-all text-sm font-semibold">{params.session_id ?? "Not provided"}</div>
              </div>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How AMS uses your credits</CardTitle>
            <CardDescription>
              Monthly plan credits are used first and reset with your billing cycle. Purchased top-up credits remain on the account until consumed unless the related payment is later refunded or reversed.
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/billing">Refresh billing</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/agents">Open agents</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
