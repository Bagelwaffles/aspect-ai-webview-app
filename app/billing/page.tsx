"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  CreditCard,
  Download,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Crown,
  Zap,
  Shield,
  Package,
  Activity,
  Settings,
} from "lucide-react"

interface SubscriptionPlan {
  id: string
  name: string
  price: number
  interval: "month" | "year"
  features: string[]
  limits: {
    products: number
    workflows: number
    executions: number
    storage: string
  }
  popular?: boolean
}

interface Invoice {
  id: string
  date: string
  amount: number
  status: "paid" | "pending" | "failed"
  description: string
  downloadUrl: string
}

interface UsageData {
  products: { used: number; limit: number }
  workflows: { used: number; limit: number }
  executions: { used: number; limit: number }
  storage: { used: number; limit: number; unit: string }
}

export default function BillingPage() {
  const [currentPlan, setCurrentPlan] = useState<SubscriptionPlan | null>(null)
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)

  // Mock data for demonstration
  useEffect(() => {
    setCurrentPlan({
      id: "pro",
      name: "Professional",
      price: 49,
      interval: "month",
      features: [
        "Unlimited products",
        "Advanced workflows",
        "Priority support",
        "Custom integrations",
        "Advanced analytics",
      ],
      limits: {
        products: -1, // unlimited
        workflows: 50,
        executions: 10000,
        storage: "100GB",
      },
    })

    setPlans([
      {
        id: "starter",
        name: "Starter",
        price: 19,
        interval: "month",
        features: ["Up to 100 products", "Basic workflows", "Email support", "Standard integrations"],
        limits: {
          products: 100,
          workflows: 10,
          executions: 1000,
          storage: "10GB",
        },
      },
      {
        id: "pro",
        name: "Professional",
        price: 49,
        interval: "month",
        features: [
          "Unlimited products",
          "Advanced workflows",
          "Priority support",
          "Custom integrations",
          "Advanced analytics",
        ],
        limits: {
          products: -1,
          workflows: 50,
          executions: 10000,
          storage: "100GB",
        },
        popular: true,
      },
      {
        id: "enterprise",
        name: "Enterprise",
        price: 149,
        interval: "month",
        features: [
          "Everything in Pro",
          "Unlimited workflows",
          "24/7 phone support",
          "Custom development",
          "SLA guarantee",
          "Dedicated account manager",
        ],
        limits: {
          products: -1,
          workflows: -1,
          executions: 100000,
          storage: "1TB",
        },
      },
    ])

    setInvoices([
      {
        id: "inv_001",
        date: "2024-01-01",
        amount: 49,
        status: "paid",
        description: "Professional Plan - January 2024",
        downloadUrl: "#",
      },
      {
        id: "inv_002",
        date: "2023-12-01",
        amount: 49,
        status: "paid",
        description: "Professional Plan - December 2023",
        downloadUrl: "#",
      },
      {
        id: "inv_003",
        date: "2023-11-01",
        amount: 49,
        status: "paid",
        description: "Professional Plan - November 2023",
        downloadUrl: "#",
      },
      {
        id: "inv_004",
        date: "2023-10-01",
        amount: 49,
        status: "failed",
        description: "Professional Plan - October 2023",
        downloadUrl: "#",
      },
    ])

    setUsage({
      products: { used: 2350, limit: -1 },
      workflows: { used: 23, limit: 50 },
      executions: { used: 7842, limit: 10000 },
      storage: { used: 45, limit: 100, unit: "GB" },
    })
  }, [])

  const handleUpgrade = async (planId: string) => {
    setIsLoading(true)
    try {
      // Call the checkout API
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      })
      const { url } = await response.json()
      if (url) {
        window.location.href = url
      }
    } catch (error) {
      console.error("Failed to create checkout session:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancelSubscription = async () => {
    setIsLoading(true)
    try {
      // Simulate API call to cancel subscription
      await new Promise((resolve) => setTimeout(resolve, 2000))
      setShowCancelDialog(false)
      // Update subscription status
    } catch (error) {
      console.error("Failed to cancel subscription:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const getUsagePercentage = (used: number, limit: number) => {
    if (limit === -1) return 0 // unlimited
    return Math.min((used / limit) * 100, 100)
  }

  const formatUsage = (used: number, limit: number, unit?: string) => {
    if (limit === -1) return `${used.toLocaleString()} ${unit || ""}`
    return `${used.toLocaleString()} / ${limit.toLocaleString()} ${unit || ""}`
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <CreditCard className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-card-foreground font-[family-name:var(--font-work-sans)]">
                Billing & Subscription
              </h1>
              <p className="text-sm text-muted-foreground">Manage your subscription and billing information</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Download Invoice
            </Button>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Billing Settings
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="plans">Plans</TabsTrigger>
            <TabsTrigger value="usage">Usage</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="payment">Payment Methods</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Current Subscription */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="font-[family-name:var(--font-work-sans)]">Current Subscription</CardTitle>
                    <CardDescription>Your active plan and billing information</CardDescription>
                  </div>
                  <Badge variant="default" className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Active
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {currentPlan && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Crown className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold">{currentPlan.name} Plan</h3>
                          <p className="text-muted-foreground">
                            ${currentPlan.price}/{currentPlan.interval}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Next billing date</p>
                        <p className="font-medium">February 1, 2024</p>
                      </div>
                    </div>
                    <Separator />
                    <div className="grid gap-3">
                      <h4 className="font-medium">Plan Features</h4>
                      <div className="grid gap-2">
                        {currentPlan.features.map((feature, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span className="text-sm">{feature}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline">Change Plan</Button>
                      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
                        <DialogTrigger asChild>
                          <Button variant="outline">Cancel Subscription</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Cancel Subscription</DialogTitle>
                            <DialogDescription>
                              Are you sure you want to cancel your subscription? You'll lose access to all premium
                              features at the end of your current billing period.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
                              Keep Subscription
                            </Button>
                            <Button variant="destructive" onClick={handleCancelSubscription} disabled={isLoading}>
                              {isLoading ? "Canceling..." : "Cancel Subscription"}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Usage Overview */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Products</CardTitle>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">{usage?.products.used.toLocaleString() || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {usage?.products.limit === -1 ? "Unlimited" : `of ${usage?.products.limit.toLocaleString()}`}
                  </p>
                  {usage && usage.products.limit !== -1 && (
                    <Progress value={getUsagePercentage(usage.products.used, usage.products.limit)} className="mt-2" />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Workflows</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">{usage?.workflows.used || 0}</div>
                  <p className="text-xs text-muted-foreground">of {usage?.workflows.limit || 0}</p>
                  {usage && (
                    <Progress
                      value={getUsagePercentage(usage.workflows.used, usage.workflows.limit)}
                      className="mt-2"
                    />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Executions</CardTitle>
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">{usage?.executions.used.toLocaleString() || 0}</div>
                  <p className="text-xs text-muted-foreground">of {usage?.executions.limit.toLocaleString() || 0}</p>
                  {usage && (
                    <Progress
                      value={getUsagePercentage(usage.executions.used, usage.executions.limit)}
                      className="mt-2"
                    />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Storage</CardTitle>
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">{usage?.storage.used || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    of {usage?.storage.limit || 0} {usage?.storage.unit || "GB"}
                  </p>
                  {usage && (
                    <Progress value={getUsagePercentage(usage.storage.used, usage.storage.limit)} className="mt-2" />
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Recent Invoices */}
            <Card>
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-work-sans)]">Recent Invoices</CardTitle>
                <CardDescription>Your latest billing history</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {invoices.slice(0, 3).map((invoice) => (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between p-3 border border-border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        {invoice.status === "paid" ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : invoice.status === "pending" ? (
                          <AlertTriangle className="h-5 w-5 text-yellow-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-500" />
                        )}
                        <div>
                          <p className="font-medium">{invoice.description}</p>
                          <p className="text-sm text-muted-foreground">{new Date(invoice.date).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="font-medium">${invoice.amount}</p>
                          <Badge
                            variant={
                              invoice.status === "paid"
                                ? "default"
                                : invoice.status === "pending"
                                  ? "secondary"
                                  : "destructive"
                            }
                          >
                            {invoice.status}
                          </Badge>
                        </div>
                        <Button variant="ghost" size="sm">
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="plans" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-3">
              {plans.map((plan) => (
                <Card key={plan.id} className={`relative ${plan.popular ? "border-primary" : ""}`}>
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                    </div>
                  )}
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Crown className="h-5 w-5 text-primary" />
                      <CardTitle className="text-xl">{plan.name}</CardTitle>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">${plan.price}</span>
                      <span className="text-muted-foreground">/{plan.interval}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      {plan.features.map((feature, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span className="text-sm">{feature}</span>
                        </div>
                      ))}
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Usage Limits</h4>
                      <div className="grid gap-1 text-sm text-muted-foreground">
                        <div className="flex justify-between">
                          <span>Products:</span>
                          <span>{plan.limits.products === -1 ? "Unlimited" : plan.limits.products}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Workflows:</span>
                          <span>{plan.limits.workflows === -1 ? "Unlimited" : plan.limits.workflows}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Executions:</span>
                          <span>{plan.limits.executions.toLocaleString()}/month</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Storage:</span>
                          <span>{plan.limits.storage}</span>
                        </div>
                      </div>
                    </div>
                    <Button
                      className="w-full"
                      variant={currentPlan?.id === plan.id ? "outline" : "default"}
                      onClick={() => handleUpgrade(plan.id)}
                      disabled={isLoading || currentPlan?.id === plan.id}
                    >
                      {currentPlan?.id === plan.id
                        ? "Current Plan"
                        : isLoading
                          ? "Processing..."
                          : "Upgrade to " + plan.name}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="usage" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="font-[family-name:var(--font-work-sans)]">Current Usage</CardTitle>
                  <CardDescription>Your usage for this billing period</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {usage && (
                    <>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>Products</span>
                          <span>{formatUsage(usage.products.used, usage.products.limit)}</span>
                        </div>
                        {usage.products.limit !== -1 && (
                          <Progress value={getUsagePercentage(usage.products.used, usage.products.limit)} />
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>Workflows</span>
                          <span>{formatUsage(usage.workflows.used, usage.workflows.limit)}</span>
                        </div>
                        <Progress value={getUsagePercentage(usage.workflows.used, usage.workflows.limit)} />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>Executions</span>
                          <span>{formatUsage(usage.executions.used, usage.executions.limit)}</span>
                        </div>
                        <Progress value={getUsagePercentage(usage.executions.used, usage.executions.limit)} />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>Storage</span>
                          <span>{formatUsage(usage.storage.used, usage.storage.limit, usage.storage.unit)}</span>
                        </div>
                        <Progress value={getUsagePercentage(usage.storage.used, usage.storage.limit)} />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-[family-name:var(--font-work-sans)]">Usage Alerts</CardTitle>
                  <CardDescription>Notifications about your usage limits</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3 p-3 border border-yellow-200 bg-yellow-50 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-yellow-600" />
                    <div>
                      <p className="font-medium text-yellow-800">Workflow executions at 78%</p>
                      <p className="text-sm text-yellow-600">Consider upgrading to avoid limits</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 border border-green-200 bg-green-50 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium text-green-800">Storage usage is healthy</p>
                      <p className="text-sm text-green-600">45% of your storage limit used</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="invoices" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-work-sans)]">Billing History</CardTitle>
                <CardDescription>All your invoices and payment history</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between p-4 border border-border rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        {invoice.status === "paid" ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : invoice.status === "pending" ? (
                          <AlertTriangle className="h-5 w-5 text-yellow-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-500" />
                        )}
                        <div>
                          <p className="font-medium">{invoice.description}</p>
                          <p className="text-sm text-muted-foreground">
                            Invoice #{invoice.id} • {new Date(invoice.date).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-medium">${invoice.amount}</p>
                          <Badge
                            variant={
                              invoice.status === "paid"
                                ? "default"
                                : invoice.status === "pending"
                                  ? "secondary"
                                  : "destructive"
                            }
                          >
                            {invoice.status}
                          </Badge>
                        </div>
                        <Button variant="ghost" size="sm">
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payment" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="font-[family-name:var(--font-work-sans)]">Payment Methods</CardTitle>
                  <CardDescription>Manage your payment methods</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                    <div className="flex items-center gap-3">
                      <CreditCard className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">•••• •••• •••• 4242</p>
                        <p className="text-sm text-muted-foreground">Expires 12/25</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="default">Primary</Badge>
                      <Button variant="ghost" size="sm">
                        Edit
                      </Button>
                    </div>
                  </div>
                  <Button variant="outline" className="w-full bg-transparent">
                    Add Payment Method
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-[family-name:var(--font-work-sans)]">Billing Information</CardTitle>
                  <CardDescription>Update your billing details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="company">Company Name</Label>
                    <Input id="company" defaultValue="Aspect Marketing Solutions" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">Billing Email</Label>
                    <Input id="email" type="email" defaultValue="billing@aspectmarketingsolutions.app" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="address">Address</Label>
                    <Input id="address" defaultValue="123 Business St" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="city">City</Label>
                      <Input id="city" defaultValue="San Francisco" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="zip">ZIP Code</Label>
                      <Input id="zip" defaultValue="94105" />
                    </div>
                  </div>
                  <Button>Update Billing Information</Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
