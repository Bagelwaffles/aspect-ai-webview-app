import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight, Check, PlayCircle, ShieldCheck, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import { agents, getAgent, statusMeta } from "../agentCatalog"
import { getAgentSalesOffer, getCategoryOutcome } from "../agentSales"

export function generateStaticParams() {
  return agents.map((agent) => ({ slug: agent.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const agent = getAgent(slug)

  if (!agent) return {}

  const offer = getAgentSalesOffer(agent)
  return {
    title: `${agent.name} | Aspect Marketing Solutions`,
    description: `${agent.description} ${offer.price}. Review availability, watch the sales video, and see the verified AMS purchase path.`,
  }
}

function salesSteps(mode: ReturnType<typeof getAgentSalesOffer>["mode"]) {
  if (mode === "subscription") {
    return [
      ["1", "Choose a plan", "Pick Starter, Growth, or Pro based on the shared monthly credit pool you need."],
      ["2", "Open the agent", "Use this agent from its verified AMS customer workflow after authentication and entitlement checks."],
      ["3", "Review the output", "A completed generation uses one shared plan credit. Human review and the agent’s guardrails remain in effect."],
    ]
  }

  if (mode === "one-time") {
    return [
      ["1", "Start the $49 order", "Use the existing secure Quick Marketing Audit checkout."],
      ["2", "Submit business context", "AMS uses the supplied business inputs to create the focused audit and action plan."],
      ["3", "Receive the result", "The native AMS fulfillment path stores and serves the customer result without changing subscription credits."],
    ]
  }

  if (mode === "beta") {
    return [
      ["1", "Review the beta scope", "See exactly what this controlled product surface can and cannot do today."],
      ["2", "Use only the verified path", "Beta access remains restricted while AMS gathers the production evidence needed for Live status."],
      ["3", "Buy when it graduates", "AMS will attach a normal commercial offer only after the production and customer-experience gates pass."],
    ]
  }

  return [
    ["1", "Review the concept", "Use this page to understand the business job, intended capabilities, and current product status."],
    ["2", "Watch the roadmap", "AMS keeps unfinished agents visible so customers can compare what exists today with what is coming next."],
    ["3", "Buy after verification", "A purchase path appears only after the agent is proven and promoted to a commercially available state."],
  ]
}

export default async function AgentSalesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const agent = getAgent(slug)
  if (!agent) notFound()

  const meta = statusMeta[agent.status]
  const offer = getAgentSalesOffer(agent)
  const outcome = getCategoryOutcome(agent.category)
  const steps = salesSteps(offer.mode)
  const related = agents
    .filter((candidate) => candidate.slug !== agent.slug && candidate.category === agent.category)
    .slice(0, 3)

  const heroLead = offer.mode === "roadmap" ? "Explore" : offer.mode === "beta" ? "See what’s next with" : "Put"
  const heroTail = offer.mode === "roadmap" || offer.mode === "beta" ? "" : "to work."

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70 bg-background/95 px-5 py-4 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 font-black tracking-tight">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary">A</span>
            <span>ASPECT<span className="text-primary">/</span>AMS</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <Link className="hover:text-foreground" href="/agents">Agent store</Link>
            <Link className="hover:text-foreground" href="/pricing">Pricing</Link>
            <Link className="hover:text-foreground" href="/contact">Contact</Link>
          </nav>
        </div>
      </header>

      <section className="border-b border-border/70 px-5 py-14 sm:px-8 lg:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">{agent.category}</Badge>
              <Badge variant="outline">{meta.label}</Badge>
              <Badge variant="outline">{offer.label}</Badge>
            </div>

            <div className="space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">AMS Agent Store</p>
              <h1 className="max-w-4xl text-4xl font-black tracking-tight sm:text-6xl lg:text-7xl">
                {heroLead} <span className="text-primary">{agent.name}</span> {heroTail}
              </h1>
              <p className="max-w-3xl text-lg leading-8 text-muted-foreground">{agent.description}</p>
              <p className="max-w-3xl text-base leading-7 text-foreground/80">{outcome}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href={offer.primaryHref}>{offer.primaryLabel}<ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
              {offer.secondaryHref && offer.secondaryLabel ? (
                <Button asChild size="lg" variant="outline">
                  <Link href={offer.secondaryHref}>{offer.secondaryLabel}</Link>
                </Button>
              ) : null}
              <Button asChild size="lg" variant="ghost">
                <Link href="/agents">Browse all agents</Link>
              </Button>
            </div>
          </div>

          <Card className="border-primary/25 bg-primary/5 shadow-xl">
            <CardHeader>
              <CardDescription>{offer.label}</CardDescription>
              <CardTitle className="text-3xl sm:text-4xl">{offer.price}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="leading-7 text-muted-foreground">{offer.detail}</p>
              <div className="space-y-3 border-t border-border/70 pt-5">
                {agent.capabilities.slice(0, 4).map((capability) => (
                  <div className="flex items-start gap-3 text-sm" key={capability}>
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                      <Check className="h-3 w-3" />
                    </span>
                    <span>{capability}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-8 lg:py-20">
        <div className="mx-auto max-w-6xl space-y-7">
          <div className="max-w-3xl space-y-3">
            <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              <PlayCircle className="h-4 w-4" /> Sales video
            </p>
            <h2 className="text-3xl font-black tracking-tight sm:text-5xl">See the AMS sales model in action.</h2>
            <p className="leading-7 text-muted-foreground">
              This sales film is embedded on every agent page so buyers can understand the AMS offer, operating model, and verified-first approach before choosing a product.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-black shadow-2xl">
            <div className="aspect-video w-full">
              <iframe
                className="h-full w-full"
                src={offer.videoEmbedUrl}
                title={offer.videoTitle}
                allow="encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border/70 bg-muted/20 px-5 py-14 sm:px-8 lg:py-20">
        <div className="mx-auto max-w-7xl space-y-8">
          <div className="max-w-3xl space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">What you are buying</p>
            <h2 className="text-3xl font-black tracking-tight sm:text-5xl">A scoped agent with visible boundaries.</h2>
            <p className="leading-7 text-muted-foreground">
              AMS sells specific business jobs, not a vague promise that one bot can do everything. These are the capabilities currently associated with {agent.name}.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {agent.capabilities.map((capability) => (
              <Card key={capability}>
                <CardHeader>
                  <Sparkles className="mb-2 h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">{capability}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-8 lg:py-20">
        <div className="mx-auto max-w-7xl space-y-8">
          <div className="max-w-3xl space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">How it works</p>
            <h2 className="text-3xl font-black tracking-tight sm:text-5xl">From interest to a controlled result.</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {steps.map(([number, title, copy]) => (
              <Card key={number}>
                <CardHeader>
                  <div className="text-sm font-black tracking-[0.2em] text-primary">{number}</div>
                  <CardTitle>{title}</CardTitle>
                  <CardDescription className="leading-6">{copy}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border/70 bg-muted/20 px-5 py-14 sm:px-8 lg:py-20">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <ShieldCheck className="mb-2 h-5 w-5 text-primary" />
              <CardDescription>Commercial status</CardDescription>
              <CardTitle>{offer.label}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">{offer.detail}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Why this lifecycle status</CardDescription>
              <CardTitle>{meta.label}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">{agent.statusReason}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Next activation gate</CardDescription>
              <CardTitle>What moves it forward</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">{agent.nextMilestone}</CardContent>
          </Card>
        </div>
      </section>

      {related.length ? (
        <section className="px-5 py-14 sm:px-8 lg:py-20">
          <div className="mx-auto max-w-7xl space-y-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Cross-sell</p>
                <h2 className="text-3xl font-black tracking-tight sm:text-4xl">More {agent.category.toLowerCase()} agents.</h2>
              </div>
              <Button asChild variant="outline"><Link href="/agents">Open full catalog</Link></Button>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {related.map((candidate) => {
                const candidateOffer = getAgentSalesOffer(candidate)
                return (
                  <Card key={candidate.slug}>
                    <CardHeader>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{statusMeta[candidate.status].label}</Badge>
                        <Badge variant="outline">{candidateOffer.label}</Badge>
                      </div>
                      <CardTitle className="pt-2">{candidate.name}</CardTitle>
                      <CardDescription className="leading-6">{candidate.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="font-bold">{candidateOffer.price}</div>
                      <Button asChild variant="outline" className="w-full">
                        <Link href={`/agents/${candidate.slug}`}>View sales page<ArrowRight className="ml-2 h-4 w-4" /></Link>
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        </section>
      ) : null}

      <section className="border-t border-border/70 bg-primary/5 px-5 py-14 sm:px-8 lg:py-20">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="max-w-3xl space-y-2">
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">{offer.mode === "roadmap" ? "Buy what is ready today." : `Ready for ${agent.name}?`}</h2>
            <p className="leading-7 text-muted-foreground">{offer.detail}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Button asChild size="lg"><Link href={offer.primaryHref}>{offer.primaryLabel}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/agents">Agent store</Link></Button>
          </div>
        </div>
      </section>
    </main>
  )
}
