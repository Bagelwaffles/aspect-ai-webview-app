"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts"
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Users, Package, Globe, Download } from "lucide-react"

// Mock data for analytics
const salesData = [
  { month: "Jan", revenue: 4500, orders: 89, customers: 67 },
  { month: "Feb", revenue: 5200, orders: 102, customers: 78 },
  { month: "Mar", revenue: 4800, orders: 95, customers: 71 },
  { month: "Apr", revenue: 6100, orders: 118, customers: 89 },
  { month: "May", revenue: 7300, orders: 142, customers: 106 },
  { month: "Jun", revenue: 8900, orders: 167, customers: 124 },
  { month: "Jul", revenue: 9200, orders: 178, customers: 132 },
  { month: "Aug", revenue: 8700, orders: 165, customers: 119 },
  { month: "Sep", revenue: 10100, orders: 195, customers: 145 },
  { month: "Oct", revenue: 11500, orders: 223, customers: 167 },
  { month: "Nov", revenue: 12800, orders: 248, customers: 186 },
  { month: "Dec", revenue: 15200, orders: 294, customers: 218 },
]

const productPerformance = [
  { name: "T-Shirts", sales: 1250, revenue: 31250, margin: 68 },
  { name: "Hoodies", sales: 890, revenue: 35600, margin: 72 },
  { name: "Mugs", sales: 2100, revenue: 31500, margin: 65 },
  { name: "Posters", sales: 650, revenue: 19500, margin: 70 },
  { name: "Phone Cases", sales: 1100, revenue: 27500, margin: 75 },
  { name: "Stickers", sales: 3200, revenue: 16000, margin: 80 },
]

const shopComparison = [
  { name: "Main Store", revenue: 45000, orders: 890, conversion: 3.2 },
  { name: "Premium Collection", revenue: 32000, orders: 640, conversion: 4.1 },
  { name: "Seasonal Items", revenue: 18000, orders: 360, conversion: 2.8 },
]

const geographicData = [
  { country: "United States", sales: 4200, percentage: 42 },
  { country: "Canada", sales: 1800, percentage: 18 },
  { country: "United Kingdom", sales: 1500, percentage: 15 },
  { country: "Australia", sales: 1200, percentage: 12 },
  { country: "Germany", sales: 800, percentage: 8 },
  { country: "Others", sales: 500, percentage: 5 },
]

const COLORS = ["#164e63", "#d97706", "#ea580c", "#4b5563", "#f97316", "#0ea5e9"]

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState("12m")
  const [selectedShop, setSelectedShop] = useState("all")

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <TrendingUp className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-card-foreground font-[family-name:var(--font-work-sans)]">
                Analytics & Insights
              </h1>
              <p className="text-sm text-muted-foreground">Track your business performance and growth</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="3m">Last 3 months</SelectItem>
                <SelectItem value="12m">Last 12 months</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="customers">Customers</TabsTrigger>
            <TabsTrigger value="geography">Geography</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Key Metrics */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">$95,200</div>
                  <div className="flex items-center text-xs text-muted-foreground">
                    <TrendingUp className="h-3 w-3 mr-1 text-accent" />
                    <span className="text-accent">+18.7%</span> from last period
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">1,890</div>
                  <div className="flex items-center text-xs text-muted-foreground">
                    <TrendingUp className="h-3 w-3 mr-1 text-accent" />
                    <span className="text-accent">+12.3%</span> from last period
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">$50.37</div>
                  <div className="flex items-center text-xs text-muted-foreground">
                    <TrendingUp className="h-3 w-3 mr-1 text-accent" />
                    <span className="text-accent">+5.2%</span> from last period
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">3.4%</div>
                  <div className="flex items-center text-xs text-muted-foreground">
                    <TrendingDown className="h-3 w-3 mr-1 text-destructive" />
                    <span className="text-destructive">-0.8%</span> from last period
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Revenue Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-work-sans)]">Revenue Trend</CardTitle>
                <CardDescription>Monthly revenue over the past year</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={salesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => [`$${value}`, "Revenue"]} />
                    <Area type="monotone" dataKey="revenue" stroke="#164e63" fill="#164e63" fillOpacity={0.1} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Shop Performance */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="font-[family-name:var(--font-work-sans)]">Shop Performance</CardTitle>
                  <CardDescription>Revenue comparison across your shops</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={shopComparison}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip formatter={(value) => [`$${value}`, "Revenue"]} />
                      <Bar dataKey="revenue" fill="#164e63" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-[family-name:var(--font-work-sans)]">Orders vs Customers</CardTitle>
                  <CardDescription>Monthly orders and new customers</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={salesData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="orders" stroke="#164e63" strokeWidth={2} />
                      <Line type="monotone" dataKey="customers" stroke="#d97706" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="products" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="font-[family-name:var(--font-work-sans)]">Product Performance</CardTitle>
                  <CardDescription>Sales and revenue by product category</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={productPerformance}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip
                        formatter={(value, name) => [
                          name === "sales" ? `${value} units` : `$${value}`,
                          name === "sales" ? "Sales" : "Revenue",
                        ]}
                      />
                      <Bar dataKey="sales" fill="#164e63" />
                      <Bar dataKey="revenue" fill="#d97706" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-[family-name:var(--font-work-sans)]">Profit Margins</CardTitle>
                  <CardDescription>Margin percentage by product category</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={productPerformance}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="margin"
                        label={({ name, margin }) => `${name}: ${margin}%`}
                      >
                        {productPerformance.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`${value}%`, "Margin"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-work-sans)]">Top Products</CardTitle>
                <CardDescription>Best performing products by revenue</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {productPerformance.map((product, index) => (
                    <div
                      key={product.name}
                      className="flex items-center justify-between p-4 border border-border rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-sm font-medium text-muted-foreground w-6">#{index + 1}</div>
                        <div className="h-12 w-12 rounded bg-muted flex items-center justify-center">
                          <Package className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <p className="text-sm text-muted-foreground">{product.sales} units sold</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">${product.revenue.toLocaleString()}</p>
                        <Badge variant="outline">{product.margin}% margin</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="customers" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">1,547</div>
                  <p className="text-xs text-muted-foreground">
                    <span className="text-accent">+186</span> new this month
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Repeat Customers</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">34%</div>
                  <p className="text-xs text-muted-foreground">
                    <span className="text-accent">+2.1%</span> from last month
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Customer LTV</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">$127.50</div>
                  <p className="text-xs text-muted-foreground">
                    <span className="text-accent">+$12.30</span> from last month
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Churn Rate</CardTitle>
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">5.2%</div>
                  <p className="text-xs text-muted-foreground">
                    <span className="text-destructive">+0.3%</span> from last month
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-work-sans)]">Customer Acquisition</CardTitle>
                <CardDescription>New customers acquired over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={salesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => [`${value}`, "New Customers"]} />
                    <Line type="monotone" dataKey="customers" stroke="#164e63" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="geography" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="font-[family-name:var(--font-work-sans)]">Sales by Country</CardTitle>
                  <CardDescription>Geographic distribution of your sales</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={geographicData}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="sales"
                        label={({ country, percentage }) => `${country}: ${percentage}%`}
                      >
                        {geographicData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`${value} orders`, "Sales"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-[family-name:var(--font-work-sans)]">Top Markets</CardTitle>
                  <CardDescription>Your best performing geographic markets</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {geographicData.map((country, index) => (
                      <div
                        key={country.country}
                        className="flex items-center justify-between p-3 border border-border rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-sm font-medium text-muted-foreground w-6">#{index + 1}</div>
                          <Globe className="h-5 w-5 text-muted-foreground" />
                          <span className="font-medium">{country.country}</span>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{country.sales} orders</p>
                          <p className="text-sm text-muted-foreground">{country.percentage}% of total</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-work-sans)]">Market Insights</CardTitle>
                <CardDescription>Key insights about your geographic performance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <div className="p-4 border border-border rounded-lg">
                    <h4 className="font-medium mb-2">Fastest Growing Market</h4>
                    <p className="text-2xl font-bold text-primary">Canada</p>
                    <p className="text-sm text-muted-foreground">+45% growth this quarter</p>
                  </div>
                  <div className="p-4 border border-border rounded-lg">
                    <h4 className="font-medium mb-2">Highest AOV</h4>
                    <p className="text-2xl font-bold text-primary">Australia</p>
                    <p className="text-sm text-muted-foreground">$67.20 average order</p>
                  </div>
                  <div className="p-4 border border-border rounded-lg">
                    <h4 className="font-medium mb-2">Best Conversion</h4>
                    <p className="text-2xl font-bold text-primary">UK</p>
                    <p className="text-sm text-muted-foreground">4.8% conversion rate</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
