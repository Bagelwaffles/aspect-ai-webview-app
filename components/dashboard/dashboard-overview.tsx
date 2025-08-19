import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Zap, ShoppingCart, Activity, DollarSign, Bot } from "lucide-react"

export function DashboardOverview() {
  const stats = [
    {
      title: "Total Credits",
      value: "1,250",
      change: "+12%",
      icon: Zap,
      color: "text-chart-1",
    },
    {
      title: "Active Workflows",
      value: "8",
      change: "+2",
      icon: Activity,
      color: "text-chart-2",
    },
    {
      title: "Products Created",
      value: "156",
      change: "+23%",
      icon: ShoppingCart,
      color: "text-chart-3",
    },
    {
      title: "Revenue Generated",
      value: "$12,450",
      change: "+18%",
      icon: DollarSign,
      color: "text-chart-4",
    },
  ]

  const recentActivity = [
    { action: "Product published to Etsy", time: "2 minutes ago", status: "success" },
    { action: "AI assistant query processed", time: "5 minutes ago", status: "success" },
    { action: "Workflow automation triggered", time: "12 minutes ago", status: "success" },
    { action: "Credits purchased", time: "1 hour ago", status: "info" },
    { action: "New product design generated", time: "2 hours ago", status: "success" },
  ]

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Welcome back!</h1>
        <p className="text-muted-foreground">Here's what's happening with your marketing automation today.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-card-foreground">{stat.title}</CardTitle>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-card-foreground">{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-chart-4">{stat.change}</span> from last month
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-card-foreground">Recent Activity</CardTitle>
            <CardDescription>Your latest automation and workflow activity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((activity, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        activity.status === "success"
                          ? "bg-chart-4"
                          : activity.status === "info"
                            ? "bg-chart-2"
                            : "bg-chart-3"
                      }`}
                    />
                    <span className="text-sm text-card-foreground">{activity.action}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{activity.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-card-foreground">Quick Actions</CardTitle>
            <CardDescription>Get started with common tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full justify-start bg-transparent" variant="outline">
              <Bot className="h-4 w-4 mr-2" />
              Ask AI Assistant
            </Button>
            <Button className="w-full justify-start bg-transparent" variant="outline">
              <ShoppingCart className="h-4 w-4 mr-2" />
              Create New Product
            </Button>
            <Button className="w-full justify-start bg-transparent" variant="outline">
              <Activity className="h-4 w-4 mr-2" />
              Setup Workflow
            </Button>
            <Button className="w-full justify-start bg-transparent" variant="outline">
              <Zap className="h-4 w-4 mr-2" />
              Purchase Credits
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
