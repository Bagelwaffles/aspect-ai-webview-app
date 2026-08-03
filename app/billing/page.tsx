import { getServerSession } from "next-auth"
import Link from "next/link"
import { redirect } from "next/navigation"

import { BillingActionButton } from "@/components/billing-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { authOptions, isCustomerAuthConfigured } from "@/lib/auth"
import { getEntitlementSnapshot } from "@/lib/server/entitlements"

export const dynamic = "force-dynamic"

function statusTone(status?: string | null) {
  if (status === "active" || status === "trialing") return "default"
  if (status === "past_due" || status === "canceled") return "destructive"
  return "secondary"
}

const PLANS = [
  { slug: "starter" as const, name: "Starter", price: "$29/month", credits: "2,000 credits" },
  { slug: "growth" as const, name: "Growth", price: "$79/month", credits: "8,000 credits" },
  { slug: "pro" as const, name: "Pro", price: "$149/month", credits: "20,000 credits" },
]

export default async function BillingPage() {
  if (!isCustomerAuthConfigured()) redirect("/login?next=/billing")

  const session = await getServerSession(authOptions).catch(() => null)
  const email = session?.user?.email?.trim().toLowerCase()
  const subject = session?.user?.customerSubject
  if (!email || !subject) redirect("/login?next=/billing")

  const snapshot = await getEntitlementSnapshot(subject).catch(() => null)
  const configured = Boolean(snapshot?.configured)
  const status = snapshot?.subscriptionStatus ?? "inactive"

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-3xl font-bold">AMS billing</h1>
            <p className="text-muted-foreground">Subscription and AI-credit access for the signed-in account.</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/">Back to dashboard</Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <CardTitle>Account access</CardTitle>
                <CardDescription>{email}</CardDescription>
              </div>
              <Badge variant={statusTone(status)} className="capitalize">
                {status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Plan</div>
              <div className="text-xl font-semibold capitalize">{snapshot?.plan ?? "None"}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Plan credits</div>
              <div className="text-xl font-semibold">{snapshot?.planCredits.toLocaleString() ?? "0"}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Top-up credits</div>
              <div className="text-xl font-semibold">{snapshot?.topupCredits.toLocaleString() ?? "0"}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Total credits</div>
              <div className="text-xl font-semibold">{snapshot?.totalCredits.toLocaleString() ?? "0"}</div>
            </div>
          </CardContent>
        </Card>

        {!configured && (
          <Card className="border-amber-500/30 bg-amber-500/10">
            <CardHeader>
              <CardTitle>Billing storage is not configured</CardTitle>
              <CardDescription>
                AMS is safely refusing to grant access until the existing Upstash or Vercel KV REST credentials are connected.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((plan) => (
            <Card key={plan.slug} className={snapshot?.plan === plan.slug ? "border-primary" : undefined}>
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>{plan.price}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{plan.credits} per billing cycle.</p>
                <p className="text-sm text-muted-foreground">
                  Content Agent is the first planned launch capability. It becomes usable only after its authenticated
                  route and entitlement gate are enabled for this account. Outreach and Analytics are not available.
                </p>
                <BillingActionButton label={`Choose ${plan.name}`} endpoint="/api/billing/checkout" plan={plan.slug} />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <BillingActionButton label="Manage subscription" endpoint="/api/billing/portal" variant="outline" />
          <Button asChild variant="ghost">
            <Link href="/grok-chat">Open agent workspace</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
