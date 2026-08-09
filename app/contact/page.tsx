import Link from "next/link"
import { ArrowRight, MessageSquareText, ShieldCheck, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-background px-5 py-12 sm:px-8 lg:py-20">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="max-w-3xl space-y-4">
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
            <Sparkles className="mr-2 h-3.5 w-3.5" />
            AMS access desk
          </Badge>
          <h1 className="text-4xl font-black tracking-tight sm:text-6xl">Tell us what you want AMS to build next.</h1>
          <p className="text-base leading-7 text-muted-foreground sm:text-lg">
            The dedicated Agent Network early-access intake is still being connected to a verified persistence and follow-up path. AMS will not collect a request here until that handoff is proven end to end.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <MessageSquareText className="h-5 w-5" />
              </div>
              <CardTitle>Need a service now?</CardTitle>
              <CardDescription className="leading-6">
                Use the existing human-reviewed AMS service path for work that is available today. No agent capability is implied by submitting a service request.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href="/ethical-agent-farm">
                  View current services <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <CardTitle>Planning around the Agent Network?</CardTitle>
              <CardDescription className="leading-6">
                Review current plans and the public roadmap while early-access intake is being hardened. Coming Soon and In Development agents are not sold as working subscription features.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link href="/pricing">View plans</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
              No fake waitlist
            </CardTitle>
            <CardDescription className="leading-6">
              AMS will enable agent early-access submissions only after the request is stored, visible to an operator, and connected to a real follow-up workflow. Until then, this page intentionally does not pretend a form has been received.
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="flex flex-wrap gap-3 border-t border-border/70 pt-8">
          <Button asChild variant="outline">
            <Link href="/agents">Back to Agent Network</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/">Back home</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
