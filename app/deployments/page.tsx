import Link from "next/link"
import { ArrowLeft, CircleOff, ExternalLink, Rocket } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function DeploymentsPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Rocket className="h-7 w-7 text-primary" aria-hidden="true" />
              <h1 className="text-3xl font-bold">Deployments</h1>
              <Badge variant="secondary">Not implemented</Badge>
            </div>
            <p className="max-w-2xl text-muted-foreground">
              Agent deployment is not connected in this launch build. AMS will not show deployment records, activity,
              or controls until the service has real persistence, authorization, and verification.
            </p>
          </div>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Back to dashboard
            </Link>
          </Button>
        </header>

        <section className="grid gap-4 md:grid-cols-2" aria-label="Deployment launch status">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CircleOff className="h-5 w-5 text-primary" aria-hidden="true" />
                No deployment actions
              </CardTitle>
              <CardDescription>The deployment API is intentionally quarantined.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Creating, activating, pausing, and embedding agents are unavailable.</p>
              <p>No deployment side effect can be triggered from this page.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ExternalLink className="h-5 w-5 text-primary" aria-hidden="true" />
                Available next steps
              </CardTitle>
              <CardDescription>Use the verified launch surfaces while deployment remains staged.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row">
              <Button asChild className="w-full sm:w-auto">
                <Link href="/content-agent">View Content Agent status</Link>
              </Button>
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link href="/request-access">Request access</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}
