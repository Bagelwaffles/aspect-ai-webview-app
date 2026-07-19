import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function ContentAgentPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <Badge variant="secondary" className="w-fit">In progress</Badge>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Content Agent</h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                The first paid-access content workflow is being finished safely. This page stays live so the mobile app never drops into an error screen.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline"><Link href="/">Back to dashboard</Link></Button>
            <Button asChild variant="outline"><Link href="/pricing">View pricing</Link></Button>
            <Button asChild><Link href="/billing">View billing</Link></Button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Current status</CardTitle>
              <CardDescription>Honest launch state for the content workflow.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>• Route is live and mobile-safe.</p>
              <p>• Generation flow is being wired to the production backend.</p>
              <p>• No fake paid access or placeholder success claims are shown here.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Next action</CardTitle>
              <CardDescription>Use the live platform controls while the agent is completed.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button asChild variant="outline"><Link href="/reviewer-access">Reviewer access</Link></Button>
              <Button asChild variant="outline"><Link href="/workflows">Workflows</Link></Button>
              <Button asChild variant="outline"><Link href="/agents">Agents</Link></Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}

