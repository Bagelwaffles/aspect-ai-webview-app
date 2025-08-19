"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Zap, Plus, Minus, Clock, ShoppingCart } from "lucide-react"

interface Transaction {
  id: string
  type: "credit" | "debit"
  amount: number
  reason: string
  timestamp: string
  balance: number
}

export function CreditsManagement() {
  const [balance, setBalance] = useState({
    totalCredits: 2500,
    usedCredits: 1250,
    remainingCredits: 1250,
  })
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchCreditsData()
  }, [])

  const fetchCreditsData = async () => {
    try {
      // Fetch balance
      const balanceResponse = await fetch("/api/credits/balance?userId=user_123")
      const balanceData = await balanceResponse.json()

      // Fetch transaction history
      const historyResponse = await fetch("/api/credits/history?userId=user_123&limit=20")
      const historyData = await historyResponse.json()

      if (balanceData.success) {
        setBalance(balanceData.balance)
      }

      if (historyData.success) {
        setTransactions(historyData.transactions)
      }
    } catch (error) {
      console.error("[v0] Failed to fetch credits data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePurchaseCredits = async (amount: number) => {
    try {
      const response = await fetch("/api/credits/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "user_123",
          amount,
          reason: "Credits Purchase",
        }),
      })

      const result = await response.json()
      if (result.success) {
        fetchCreditsData() // Refresh data
      }
    } catch (error) {
      console.error("[v0] Failed to purchase credits:", error)
    }
  }

  const usagePercentage = (balance.usedCredits / balance.totalCredits) * 100

  const creditPackages = [
    { amount: 1000, price: "$10", bonus: 0 },
    { amount: 2500, price: "$20", bonus: 500 },
    { amount: 5000, price: "$35", bonus: 1500 },
    { amount: 10000, price: "$60", bonus: 4000 },
  ]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-foreground">Loading credits data...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Credits Management</h1>
        <p className="text-muted-foreground">Monitor and manage your credit usage and purchases</p>
      </div>

      {/* Credits Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Credits</CardTitle>
            <Zap className="h-4 w-4 text-chart-1" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{balance.totalCredits.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Current plan allocation</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Credits Used</CardTitle>
            <Minus className="h-4 w-4 text-chart-3" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{balance.usedCredits.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{usagePercentage.toFixed(1)}% of total credits</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Credits Remaining</CardTitle>
            <Plus className="h-4 w-4 text-chart-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{balance.remainingCredits.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Available for use</p>
          </CardContent>
        </Card>
      </div>

      {/* Usage Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Credit Usage Progress</CardTitle>
          <CardDescription>Your credit consumption for the current period</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Credits Used</span>
              <span>
                {balance.usedCredits.toLocaleString()} / {balance.totalCredits.toLocaleString()}
              </span>
            </div>
            <Progress value={usagePercentage} className="h-3" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Usage: {usagePercentage.toFixed(1)}%</span>
              <span>{balance.remainingCredits.toLocaleString()} remaining</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="history" className="space-y-4">
        <TabsList>
          <TabsTrigger value="history">Transaction History</TabsTrigger>
          <TabsTrigger value="purchase">Purchase Credits</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>Your latest credit transactions and usage</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {transactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between py-3 border-b border-border last:border-0"
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          transaction.type === "credit" ? "bg-chart-4/20" : "bg-chart-3/20"
                        }`}
                      >
                        {transaction.type === "credit" ? (
                          <Plus className="h-4 w-4 text-chart-4" />
                        ) : (
                          <Minus className="h-4 w-4 text-chart-3" />
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-card-foreground">{transaction.reason}</div>
                        <div className="text-sm text-muted-foreground flex items-center">
                          <Clock className="h-3 w-3 mr-1" />
                          {new Date(transaction.timestamp).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-medium ${transaction.type === "credit" ? "text-chart-4" : "text-chart-3"}`}>
                        {transaction.type === "credit" ? "+" : "-"}
                        {transaction.amount.toLocaleString()}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Balance: {transaction.balance.toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="purchase" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Purchase Additional Credits</CardTitle>
              <CardDescription>Top up your account with more credits for continued usage</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {creditPackages.map((pkg) => (
                  <Card key={pkg.amount} className="relative">
                    {pkg.bonus > 0 && (
                      <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2 bg-primary text-xs">
                        +{pkg.bonus} Bonus
                      </Badge>
                    )}
                    <CardHeader className="text-center pb-2">
                      <CardTitle className="text-lg">{pkg.amount.toLocaleString()}</CardTitle>
                      {pkg.bonus > 0 && (
                        <CardDescription className="text-xs">
                          +{pkg.bonus.toLocaleString()} bonus credits
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="text-center space-y-3">
                      <div className="text-2xl font-bold text-primary">{pkg.price}</div>
                      <Button className="w-full" onClick={() => handlePurchaseCredits(pkg.amount + pkg.bonus)}>
                        <ShoppingCart className="h-4 w-4 mr-2" />
                        Purchase
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
