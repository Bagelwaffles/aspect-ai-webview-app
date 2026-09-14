import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Bot, ClipboardCheck, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Start with AMS | Aspect Marketing Solutions",
  description:
    "Choose the fastest verified way to start with Aspect Marketing Solutions: the $49 Quick Marketing Audit, seven Live AI agents, or the AMS Agent Store.",
}

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-background px-5 py-12 sm:px-8 lg:py-20">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="max-w-3xl space-y-4">
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
            <Sparkles className="mr-2 h-3.5 w-3.5" />
            Start with AMS
          </Badge>
          <h1 className="text-4xl font-black tracking-tight sm:text-6xl">Choose the fastest way to put AMS to work.</h1>
          <p className="text-base leading-7 text-muted-foreground sm:text-lg">
            AMS already has verified products you can use today. Start with a focused $49 marketing audit, compare the seven Live subscription agents, or browse the full Agent Store before choosing a plan.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="border-primary/25 bg-primary/5">
            <CardHeader>
              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ClipboardCheck className="h-5 w-5" />
              </div>
              <CardDescription>One-time service</CardDescription>
              <CardTitle>$49 Quick Marketing Audit</CardTitle>
              <CardDescription className="leading-6">
                Get five marketing problems, five specific fixes, a stronger headline and offer, one promotional post, and a practical 7-day action plan. Delivery is targeted within 48 hours.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href="/quick-marketing-audit">
                  Get the $49 audit <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-foreground">
                <Bot className="h-5 w-5" />
              </div>
              <CardDescription>Subscription</CardDescription>
              <CardTitle>7 Live AI agents</CardTitle>
              <CardDescription className="leading-6">
                Content, Lead Magnet, Email Campaign, Nurture, Outreach, SEO, and Product Creator are included in AMS shared-credit plans starting at $29/month.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link href="/pricing#plans">
                  Compare plans <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-foreground">
                <Sparkles className="h-5 w-5" />
              </div>
              <CardDescription>Explore first</CardDescription>
              <CardTitle>Browse the Agent Store</CardTitle>
              <CardDescription className="leading-6">
                Compare Live, Beta, Setup Required, Blocked, and Planned capabilities before you buy. AMS keeps unfinished work clearly separated from products that are available now.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full">
                <Link href="/agents#catalog">
                  Open the Agent Store <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader>
            <CardTitle>Verified paths instead of a dead contact form</CardTitle>
            <CardDescription className="leading-6">
              AMS routes new buyers through product paths that are already connected to a real next step. A generic contact form will not be presented as working until its storage and follow-up path is verified end to end.
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="flex flex-wrap gap-3 border-t border-border/70 pt-8">
          <Button asChild variant="outline">
            <Link href="/">Back home</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/agents">Agent Store</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
