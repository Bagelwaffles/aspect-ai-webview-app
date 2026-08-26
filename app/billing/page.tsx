import { getServerSession } from "next-auth"
import Link from "next/link"
import { redirect } from "next/navigation"

import { BillingActionButton } from "@/components/billing-actions"
import { CreditTopupPurchasePanel } from "@/components/credit-topup-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { authOptions, isCustomerAuthConfigured } from "@/lib/auth"
import { isContentAgentLaunchEnabled } from "@/lib/content-agent-launch"
import { getEntitlementSnapshot, monthlyCreditsForPlan } from "@/lib/server/entitlements"

export const dynamic = "force-dynamic"

function statusTone(status?: string | null) {
  if (status === "active" || status === "trialing") return "default"
  if (status === "past_due" || status === "canceled") return "destructive"
  return "secondary"
}

const PLANS = [
  { slug: "starter" as const, name: "Starter", price: "$29/month", credits: monthlyCreditsForPlan("starter") },
  { slug: "growth" as const, name: "Growth", price: "$79/month", credits: monthlyCreditsForPlan("growth") },
  { slug: "pro" as const, name: "Pro", price: "$149/month", credits: monthlyCreditsForPlan("pro") },
]

const LIVE_MARKETING_AGENTS = "Content, Lead Magnet, Outreach, SEO, and Email Campaign"

export default async function BillingPage() {
  if (!isCustomerAuthConfigured()) redirect("/login?next=/billing")

  const session = await getServerSession(authOptions).catch(() => null)
  const email = session?.user?.email?.trim().toLowerCase()
  const subject = session?.user?.customerSubject
  if (!email || !subject) redirect("/login?next=/billing")

  const snapshot = await getEntitlementSnapshot(subject).catch(() => null)
  const configured = Boolean(snapshot?.configured)
  const status = snapshot?.subscriptionStatus ?? "inactive"
  const contentAgentLive = isContentAgentLaunchEnabled()
  const subscriptionActive = status === "active" || status === "trialing"
  const monthlyAllowance = snapshot?.plan ? monthlyCreditsForPlan(snapshot.plan) : 0
  const creditsRemaining = snapshot?.totalCredits ?? 0
  const lowCreditThreshold = Math.max(1, Math.ceil(monthlyAllowance * 0.2))
  const criticalCreditThreshold = Math.max(1, Math.ceil(monthlyAllowance * 0.1))
  const creditWarning = subscriptionActive && monthlyAllowance > 0 && creditsRemaining <= lowCreditThreshold
  const creditCritical = creditWarning && creditsRemaining <= criticalCreditThreshold

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-3xl font-bold">AMS billing</h1>
            <p className="text-muted-foreground">Subscription and shared AI credit access for the signed-in account.</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/">Back to dashboard</Link>
          </Button>
        </div>

        {!contentAgentLive ? (
          <Card className="border-amber-500/40 bg-amber-500/10">
            <CardHeader>
              <CardTitle>New paid AI subscriptions are paused</CardTitle>
              <CardDescription>
                Content Agent has passed controlled provider testing but remains behind the production launch gate. Existing subscribers can still manage their subscription, and no new paid checkout opens while the gate is disabled.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/ethical-agent-farm/request?offer=content-agent-beta">Join the beta list</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {creditWarning ? (
          <Card className={creditCritical ? "border-destructive/50 bg-destructive/10" : "border-amber-500/40 bg-amber-500/10"}>
            <CardHeader>
              <CardTitle>{creditCritical ? "Credits are running critically low" : "Credits are running low"}</CardTitle>
              <CardDescription>
                {creditsRemaining.toLocaleString()} shared credits remain. Monthly plan credits reset with the billing cycle; purchased top-up credits remain until used.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

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
                <p className="text-sm text-muted-foreground">
                  {plan.credits.toLocaleString()} shared AI generation credits per billing cycle. One completed generation from any included Live marketing agent uses one shared credit.
                </p>
                <p className="text-sm text-muted-foreground">
                  Includes {LIVE_MARKETING_AGENTS}. New agents join the subscription only after production verification.
                </p>
                {contentAgentLive ? (
                  subscriptionActive ? (
                    <div className="space-y-2">
                      <Button type="button" disabled>
                        {snapshot?.plan === plan.slug ? "Current plan" : "Use billing portal to change plan"}
                      </Button>
                    </div>
                  ) : (
                    <BillingActionButton label={`Choose ${plan.name}`} endpoint="/api/billing/checkout" plan={plan.slug} />
                  )
                ) : (
                  <div className="space-y-2">
                    <Button type="button" disabled>Checkout paused</Button>
                    <p className="text-xs text-muted-foreground">No payment can be started for this plan.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {configured && subscriptionActive ? (
          <CreditTopupPurchasePanel />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Extra credits</CardTitle>
              <CardDescription>
                Manual credit top-ups become available after an AMS subscription is active.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <div className="flex flex-wrap gap-3">
          <BillingActionButton label="Manage subscription" endpoint="/api/billing/portal" variant="outline" />
          <Button asChild variant="ghost">
            <Link href="/agents">View Live agents</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
