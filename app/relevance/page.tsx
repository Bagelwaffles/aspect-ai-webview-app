import Link from "next/link"
import { Brain, Clock3, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function RelevancePage() {
  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <Badge variant="secondary" className="w-fit">
              Launch staging: unavailable
            </Badge>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Brain className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Relevance AI</h1>
                <p className="mt-2 max-w-2xl text-muted-foreground">
                  This integration is being prepared for a later release. Agent creation, workflow management, and execution are disabled during launch staging.
                </p>
              </div>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/">Back to dashboard</Link>
          </Button>
        </header>

        <section className="grid gap-4 md:grid-cols-2" aria-label="Relevance AI launch status">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock3 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                <CardTitle>In progress</CardTitle>
              </div>
              <CardDescription>No Relevance operations are available in launch staging.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Agent and workflow records are not exposed here.</p>
              <p>Run, create, and management controls will remain unavailable until the integration passes launch review.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                <CardTitle>Launch boundary</CardTitle>
              </div>
              <CardDescription>The staging quarantine does not report simulated activity or success.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link href="/agents">View launch agents</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/workflows">View workflows</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}
