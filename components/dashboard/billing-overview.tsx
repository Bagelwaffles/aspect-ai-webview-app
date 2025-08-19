"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { CreditCard, Zap, Calendar, TrendingUp } from "lucide-react"

export function BillingOverview() {
  const currentPlan = {
    name: "Pro Plan",
    price: "$49",
    period: "month",
    credits: 2500,
    creditsUsed: 1250,
    nextBilling: "Dec 15, 2024",
    status: "active",
  }

  const usagePercentage = (currentPlan.creditsUsed / currentPlan.credits) * 100

  const plans = [
    {
      name: "Starter",
      price: "$19",
      credits: 1000,
      features: ["Basic AI Assistant", "5 Workflows", "Email Support"],
      popular: false,
    },
    {
      name: "Pro",
      price: "$49",
      credits: 2500,
      features: ["Advanced AI Assistant", "Unlimited Workflows", "Priority Support", "Analytics Dashboard"],
      popular: true,
    },
    {
      name: "Enterprise",
      price: "$99",
      credits: 10000,
      features: ["Custom AI Models", "White-label Solution", "Dedicated Support", "Custom Integrations"],
      popular: false,
    },
  ]

  const handleUpgrade = async (priceId: string) => {
    try {
      const response = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      })

      const { url } = await response.json()
      window.open(url, "_blank")
    } catch (error) {
      console.error("[v0] Upgrade error:", error)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Billing & Subscription</h1>
        <p className="text-muted-foreground">Manage your subscription and billing information</p>
      </div>

      {/* Current Plan Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Plan</CardTitle>
            <CreditCard className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{currentPlan.name}</div>
            <p className="text-xs text-muted-foreground">
              {currentPlan.price}/{currentPlan.period}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Credits Remaining</CardTitle>
            <Zap className="h-4 w-4 text-chart-1" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{currentPlan.credits - currentPlan.creditsUsed}</div>
            <p className="text-xs text-muted-foreground">of {currentPlan.credits} total credits</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Next Billing</CardTitle>
            <Calendar className="h-4 w-4 text-chart-2" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{currentPlan.nextBilling}</div>
            <p className="text-xs text-muted-foreground">Auto-renewal enabled</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Usage</CardTitle>
            <TrendingUp className="h-4 w-4 text-chart-3" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{usagePercentage.toFixed(0)}%</div>
            <p className="text-xs text-muted-foreground">Credits used this month</p>
          </CardContent>
        </Card>
      </div>

      {/* Usage Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Credit Usage</CardTitle>
          <CardDescription>Your credit consumption for the current billing period</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Credits Used</span>
              <span>
                {currentPlan.creditsUsed} / {currentPlan.credits}
              </span>
            </div>
            <Progress value={usagePercentage} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Resets on {currentPlan.nextBilling}</span>
              <span>{currentPlan.credits - currentPlan.creditsUsed} remaining</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Available Plans */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <Card key={plan.name} className={`relative ${plan.popular ? "border-primary" : ""}`}>
              {plan.popular && (
                <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-primary">Most Popular</Badge>
              )}
              <CardHeader>
                <CardTitle className="text-center">{plan.name}</CardTitle>
                <div className="text-center">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <CardDescription className="text-center">
                  {plan.credits.toLocaleString()} credits included
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-center text-sm">
                      <span className="w-2 h-2 bg-primary rounded-full mr-2" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={plan.name === currentPlan.name ? "secondary" : "default"}
                  onClick={() => handleUpgrade(plan.name.toLowerCase())}
                  disabled={plan.name === currentPlan.name}
                >
                  {plan.name === currentPlan.name ? "Current Plan" : "Upgrade"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Billing History */}
      <Card>
        <CardHeader>
          <CardTitle>Billing History</CardTitle>
          <CardDescription>Your recent billing transactions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { date: "Nov 15, 2024", amount: "$49.00", status: "Paid", invoice: "INV-001" },
              { date: "Oct 15, 2024", amount: "$49.00", status: "Paid", invoice: "INV-002" },
              { date: "Sep 15, 2024", amount: "$19.00", status: "Paid", invoice: "INV-003" },
            ].map((transaction, index) => (
              <div key={index} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <div className="font-medium">{transaction.invoice}</div>
                  <div className="text-sm text-muted-foreground">{transaction.date}</div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{transaction.amount}</div>
                  <Badge variant={transaction.status === "Paid" ? "secondary" : "destructive"}>
                    {transaction.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
