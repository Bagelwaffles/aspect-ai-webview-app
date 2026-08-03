import Link from "next/link"
import {
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  FileText,
  LockKeyhole,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Target,
  Workflow,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const launchAgents = [
  {
    slug: "content",
    name: "Content Agent",
    icon: FileText,
    description: "Creates practical marketing copy, product descriptions, email drafts, and social content.",
  },
  {
    slug: "outreach",
    name: "Outreach Agent",
    icon: Target,
    description: "Builds focused lead qualification, offers, and one-message outreach drafts without spam tactics.",
  },
  {
    slug: "analytics",
    name: "Analytics Agent",
    icon: BarChart3,
    description: "Turns supplied business data into clear findings, priorities, and next-step recommendations.",
  },
]

const safeguards = [
  "Customer sign-in before paid AI access",
  "Signed Stripe webhook fulfillment",
  "Persistent plan credits and agent access",
  "Rate limits on paid AI routes",
  "No fabricated revenue or interaction metrics",
]

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.18),transparent_35%),radial-gradient(circle_at_80%_15%,rgba(126,34,206,0.16),transparent_30%),linear-gradient(to_bottom,#050816,#090d1a_50%,#050816)]" />

      <header className="border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/15 text-primary">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold tracking-tight">Aspect Marketing Solutions</div>
              <div className="text-xs text-muted-foreground">AI marketing platform</div>
            </div>
          </Link>

          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <Link href="/agents" className="transition hover:text-foreground">Agents</Link>
            <Link href="/pricing" className="transition hover:text-foreground">Pricing</Link>
            <Link href="/ethical-agent-farm" className="transition hover:text-foreground">Services</Link>
          </nav>

          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/pricing">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="relative">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="space-y-7">
            <Badge variant="outline" className="border-cyan-400/30 bg-cyan-400/10 text-cyan-200">
              <Sparkles className="mr-2 h-3.5 w-3.5" />
              Built for practical marketing execution
            </Badge>

            <div className="space-y-5">
              <h1 className="max-w-4xl text-4xl font-black tracking-tight sm:text-6xl lg:text-7xl">
                Turn marketing work into a repeatable system.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                AMS combines secure customer accounts, usage-based AI agents, Stripe billing, and focused marketing services in one mobile-first platform.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/pricing">
                  View plans
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/ethical-agent-farm">Explore one-time services</Link>
              </Button>
            </div>

            <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
              {safeguards.slice(0, 4).map((item) => (
                <div key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <Card className="border-primary/25 bg-card/80 shadow-2xl shadow-primary/10 backdrop-blur-xl">
            <CardHeader>
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <Workflow className="h-6 w-6" />
              </div>
              <CardTitle className="text-2xl">Revenue-first launch stack</CardTitle>
              <CardDescription>
                The first release is deliberately narrow: three useful agents, honest account state, and verified billing fulfillment.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {launchAgents.map((agent) => {
                const Icon = agent.icon
                return (
                  <div key={agent.slug} className="flex gap-3 rounded-xl border border-border/70 bg-background/50 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-semibold">{agent.name}</div>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{agent.description}</p>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="border-y border-border/70 bg-card/30">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="bg-background/60">
              <CardHeader>
                <LockKeyhole className="mb-3 h-6 w-6 text-primary" />
                <CardTitle>Account-gated AI</CardTitle>
                <CardDescription>
                  Paid routes require authenticated customer identity or a protected internal system key.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card className="bg-background/60">
              <CardHeader>
                <ShieldCheck className="mb-3 h-6 w-6 text-primary" />
                <CardTitle>Verified fulfillment</CardTitle>
                <CardDescription>
                  Browser redirects never grant access. Signed Stripe events update plans, credits, and agent entitlements.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card className="bg-background/60">
              <CardHeader>
                <Megaphone className="mb-3 h-6 w-6 text-primary" />
                <CardTitle>Honest marketing</CardTitle>
                <CardDescription>
                  AMS does not display invented revenue, fabricated interactions, or fake deployment success.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Launch scope</p>
            <h2 className="text-3xl font-bold sm:text-4xl">Finish the core. Then expand.</h2>
            <p className="leading-7 text-muted-foreground">
              AMS starts with the functions most likely to save time or produce revenue. Additional agents remain disabled until their integrations and execution paths are real.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {safeguards.map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-xl border border-border/70 bg-card/50 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                <span className="text-sm leading-6">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border/70 bg-primary/5">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-5 py-14 sm:px-8 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-3xl font-bold">Start with a plan or a one-time project.</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Choose the route that fits the business today. Unconfigured checkout paths fall back safely instead of claiming success.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/pricing">Compare pricing</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Customer sign in</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-5 py-8 text-sm text-muted-foreground sm:px-8 md:flex-row">
          <span>© 2026 Aspect Marketing Solutions</span>
          <div className="flex gap-5">
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
            <Link href="/contact" className="hover:text-foreground">Contact</Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
