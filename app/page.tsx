"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  BarChart3,
  Package,
  Workflow,
  CreditCard,
  TrendingUp,
  ShoppingCart,
  Settings,
  Bell,
  Search,
  Plus,
  Activity,
  DollarSign,
  Eye,
  MoreHorizontal,
} from "lucide-react"

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("overview")

  const handleNavigation = (tab: string) => {
    if (tab === "products") {
      window.location.href = "/products"
    } else if (tab === "analytics") {
      window.location.href = "/analytics"
    } else if (tab === "workflows") {
      window.location.href = "/workflows"
    } else if (tab === "billing") {
      window.location.href = "/billing"
    } else {
      setActiveTab(tab)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center border-b border-sidebar-border px-6">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
                <Package className="h-5 w-5 text-sidebar-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-sidebar-foreground font-[family-name:var(--font-work-sans)]">
                VO.app
              </span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            {[
              { id: "overview", label: "Overview", icon: BarChart3 },
              { id: "products", label: "Products", icon: Package },
              { id: "workflows", label: "Workflows", icon: Workflow },
              { id: "billing", label: "Billing", icon: CreditCard },
              { id: "analytics", label: "Analytics", icon: TrendingUp },
              { id: "settings", label: "Settings", icon: Settings },
            ].map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigation(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    activeTab === item.id
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </button>
              )
            })}
          </nav>

          {/* User Profile */}
          <div className="border-t border-sidebar-border p-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src="/placeholder.svg?key=cx84q" />
                <AvatarFallback>JD</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">John Doe</p>
                <p className="text-xs text-muted-foreground truncate">john@example.com</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="pl-64">
        {/* Top Bar */}
        <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-16 items-center gap-4 px-6">
            <div className="flex-1">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  placeholder="Search products, orders, workflows..."
                  className="w-full rounded-lg border border-input bg-input pl-10 pr-4 py-2 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => handleNavigation("products")}>
                <Plus className="h-4 w-4 mr-2" />
                New Product
              </Button>
              <Button variant="ghost" size="sm">
                <Bell className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="p-6">
          {/* Stats Cards */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">$45,231.89</div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-accent">+20.1%</span> from last month
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Products</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">2,350</div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-accent">+180</span> new this month
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Orders</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">12,234</div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-accent">+19%</span> from last month
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Workflows</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">573</div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-accent">+201</span> since last hour
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main Dashboard Grid */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Recent Orders */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-work-sans)]">Recent Orders</CardTitle>
                <CardDescription>You have 256 orders this month.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    {
                      id: "#3210",
                      customer: "Olivia Martin",
                      product: "Custom T-Shirt",
                      status: "Processing",
                      amount: "$79.00",
                    },
                    {
                      id: "#3209",
                      customer: "Jackson Lee",
                      product: "Hoodie Design",
                      status: "Shipped",
                      amount: "$39.00",
                    },
                    {
                      id: "#3208",
                      customer: "Isabella Nguyen",
                      product: "Mug Print",
                      status: "Delivered",
                      amount: "$299.00",
                    },
                    {
                      id: "#3207",
                      customer: "William Kim",
                      product: "Poster Set",
                      status: "Processing",
                      amount: "$99.00",
                    },
                    {
                      id: "#3206",
                      customer: "Sofia Davis",
                      product: "Phone Case",
                      status: "Shipped",
                      amount: "$39.00",
                    },
                  ].map((order) => (
                    <div
                      key={order.id}
                      className="flex items-center justify-between p-4 border border-border rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <Avatar className="h-9 w-9">
                          <AvatarImage
                            src={`/abstract-geometric-shapes.png?height=36&width=36&query=${order.customer.replace(" ", "+")}`}
                          />
                          <AvatarFallback>
                            {order.customer
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{order.customer}</p>
                          <p className="text-sm text-muted-foreground">{order.product}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge
                          variant={
                            order.status === "Delivered"
                              ? "default"
                              : order.status === "Shipped"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {order.status}
                        </Badge>
                        <p className="text-sm font-medium">{order.amount}</p>
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-work-sans)]">Quick Actions</CardTitle>
                <CardDescription>Manage your business efficiently</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button className="w-full justify-start bg-transparent" variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Product
                </Button>
                <Button className="w-full justify-start bg-transparent" variant="outline">
                  <Workflow className="h-4 w-4 mr-2" />
                  Setup Workflow
                </Button>
                <Button className="w-full justify-start bg-transparent" variant="outline">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  View Analytics
                </Button>
                <Button className="w-full justify-start bg-transparent" variant="outline">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Billing Settings
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Workflow Status */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="font-[family-name:var(--font-work-sans)]">Active Workflows</CardTitle>
              <CardDescription>Monitor your automation processes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[
                  { name: "Product Sync", status: "Running", lastRun: "2 minutes ago", success: 98 },
                  { name: "Order Processing", status: "Running", lastRun: "5 minutes ago", success: 95 },
                  { name: "Inventory Update", status: "Paused", lastRun: "1 hour ago", success: 87 },
                  { name: "Customer Notifications", status: "Running", lastRun: "30 seconds ago", success: 99 },
                  { name: "Analytics Sync", status: "Running", lastRun: "10 minutes ago", success: 92 },
                  { name: "Backup Process", status: "Scheduled", lastRun: "6 hours ago", success: 100 },
                ].map((workflow) => (
                  <div key={workflow.name} className="p-4 border border-border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">{workflow.name}</h4>
                      <Badge
                        variant={
                          workflow.status === "Running"
                            ? "default"
                            : workflow.status === "Paused"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {workflow.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">Last run: {workflow.lastRun}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Success rate: {workflow.success}%</span>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  )
}
