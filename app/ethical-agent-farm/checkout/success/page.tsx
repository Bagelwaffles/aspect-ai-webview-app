import Link from "next/link"
import { ArrowRight, CircleOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function EthicalAgentFarmCheckoutSuccessPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <CircleOff className="h-6 w-6 text-primary" />
              <div>
                <CardTitle>One-time checkout is disabled</CardTitle>
                <CardDescription>No purchase or fulfillment was started from this route.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Scoped services are request-only during launch. Submit the intake form for human review, or view the verified recurring subscription plans.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/ethical-agent-farm/request">
                  <ArrowRight className="mr-2 h-4 w-4" />
                  Request a service review
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/pricing">View subscriptions</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
