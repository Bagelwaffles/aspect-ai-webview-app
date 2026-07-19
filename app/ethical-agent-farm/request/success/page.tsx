import Link from "next/link"
import { CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function OfferRequestSuccessPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-primary" />
              <div>
                <CardTitle>Request received</CardTitle>
                <CardDescription>We’ll review your business and follow up.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              No payment has been charged yet. This request is just the intake step for the offer review.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/ethical-agent-farm">Back to agent farm</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/billing">View billing</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
