import Link from "next/link"
import { CheckCircle2, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type PageProps = {
  searchParams: Promise<{ offer?: string }>
}

const OFFER_LABELS: Record<string, string> = {
  "quick-marketing-audit": "Quick Marketing Audit",
  "social-content-pack": "Social Content Pack",
  "website-profile-review": "Website / Google Profile Review",
  "business-cleanup-plan": "Business Cleanup Plan",
}

export default async function EthicalAgentFarmCheckoutSuccessPage({ searchParams }: PageProps) {
  const params = await searchParams
  const label = params.offer ? OFFER_LABELS[params.offer] || "Your offer" : "Your offer"

  return (
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-primary" />
              <div>
                <CardTitle>Checkout started</CardTitle>
                <CardDescription>{label} is ready for review and fulfillment.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              If payment completed successfully, we’ll review the request and follow up with the next steps.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/ethical-agent-farm">
                  <ArrowRight className="mr-2 h-4 w-4" />
                  Back to agent farm
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/billing">Review billing</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
