import Link from "next/link"
import { ArrowLeft, BarChart3, FileText, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function AnalyticsPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <BarChart3 className="h-7 w-7 text-primary" aria-hidden="true" />
              <h1 className="text-3xl font-bold">Analytics</h1>
              <Badge variant="secondary">Not connected</Badge>
            </div>
            <p className="max-w-2xl text-muted-foreground">
              AMS does not currently have a verified analytics data source. Reports and performance metrics will remain
              unavailable until a real source is connected and validated.
            </p>
          </div>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Back to dashboard
            </Link>
          </Button>
        </header>

        <section className="grid gap-4 md:grid-cols-2" aria-label="Analytics launch status">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
                Current status
              </CardTitle>
              <CardDescription>No customer analytics are being presented on this page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Revenue, conversion, traffic, and campaign reporting are not connected.</p>
              <p>Export and reporting controls will be added only after persisted data is available.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
                Continue with AMS
              </CardTitle>
              <CardDescription>Review the first launch capability without implying analytics are active.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full sm:w-auto">
                <Link href="/content-agent">View Content Agent status</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}
