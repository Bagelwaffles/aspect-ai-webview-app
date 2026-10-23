import { AmsPublicHeader } from "@/components/ams-public-header"
import { AmsPublicFooter } from "@/components/ams-public-footer"
import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { notFound } from "next/navigation"
import { ArrowRight, Check, PlayCircle, ShieldCheck, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import { agents, getAgent, statusMeta } from "../agentCatalog"
import { getAgentSalesOffer, getCategoryOutcome } from "../agentSales"
import { customerAgentDescription, customerOfferDescription } from "../customerCopy"
import { isContentAgentLaunchEnabled } from "@/lib/content-agent-launch"

export function generateStaticParams() {
  return agents.filter((agent) => !agent.internal).map((agent) => ({ slug: agent.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const agent = getAgent(slug)

  if (!agent || agent.internal) return {}

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
      ["2", "Open the agent", "Sign in and choose the marketing task you want to complete."],
      ["3", "Review the output", "Review each result before using it. Each completed request uses one plan credit."],
    ]
  }

  if (mode === "one-time") {
    return [
      ["1", "Start the $49 order", "Use the existing secure Quick Marketing Audit checkout."],
      ["2", "Submit business context", "AMS uses the supplied business inputs to create the focused audit and action plan."],
      ["3", "Receive the result", "Get your audit and action plan within the stated delivery window."],
    ]
  }

  if (mode === "beta") {
    return [
      ["1", "Review the beta scope", "See exactly what this controlled product surface can and cannot do today."],
      ["2", "Use only the verified path", "Access is limited while we prepare this service for more customers."],
      ["3", "Buy when it graduates", "Purchasing will be available when this service is ready."],
    ]
  }

  return [
    ["1", "Review the concept", "Use this page to understand the business job, intended capabilities, and current product status."],
    ["2", "Watch the roadmap", "AMS keeps unfinished agents visible so customers can compare what exists today with what is coming next."],
    ["3", "Buy after verification", "Purchasing will be available once this service is ready."],
  ]
}

export default async function AgentSalesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const agent = getAgent(slug)
  if (!agent || agent.internal) notFound()

  const meta = statusMeta[agent.status]
  const offer = getAgentSalesOffer(agent)
  const checkoutAvailable = isContentAgentLaunchEnabled()
  const outcome = getCategoryOutcome(agent.category)
  const steps = salesSteps(offer.mode)
  const related = agents
    .filter((candidate) => !candidate.internal && candidate.slug !== agent.slug && candidate.category === agent.category)
    .slice(0, 3)

  const heroLead = offer.mode === "roadmap" ? "Explore" : offer.mode === "beta" ? "See what’s next with" : "Put"
  const heroTail = offer.mode === "roadmap" || offer.mode === "beta" ? "" : "to work."

  return (
    <>
      <AmsPublicHeader />
      <main className="ams-public-page ams-public-page min-h-screen bg-background text-foreground">
      

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
              <p className="max-w-3xl text-lg leading-8 text-muted-foreground">{customerAgentDescription(agent)}</p>
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

          <div className="space-y-5">
          {agent.image ? (
            <div className="relative mx-auto aspect-[4/5] w-full max-w-[30rem] overflow-hidden rounded-3xl border border-cyan-300/20 bg-slate-950 shadow-[0_24px_80px_rgba(34,211,238,0.12)]">
              <Image
                src={agent.image.src}
                alt={agent.image.alt}
                fill
                priority
                sizes="(max-width: 1023px) min(100vw - 40px, 480px), 38vw"
                className="object-cover"
              />
            </div>
          ) : null}
          <Card className="border-primary/25 bg-primary/5 shadow-xl">
            <CardHeader>
              <CardDescription>{!checkoutAvailable && offer.mode === "subscription" ? "New subscriptions paused" : offer.label}</CardDescription>
              <CardTitle className="text-3xl sm:text-4xl">{offer.price}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="leading-7 text-muted-foreground">{customerOfferDescription(agent)}</p>
              <div className="space-y-3 border-t border-border/70 pt-5">
                {agent.status === "live" ? agent.capabilities.slice(0, 4).map((capability) => (
                  <div className="flex items-start gap-3 text-sm" key={capability}>
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                      <Check className="h-3 w-3" />
                    </span>
                    <span>{capability}</span>
                  </div>
                )) : null}
              </div>
            </CardContent>
          </Card>
          </div>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-8 lg:py-20">
        <div className="mx-auto max-w-6xl space-y-7">
          <div className="max-w-3xl space-y-3">
            <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              <PlayCircle className="h-4 w-4" /> Sales video
            </p>
            <h2 className="text-3xl font-black tracking-tight sm:text-5xl">See how AMS can support your business.</h2>
            <p className="leading-7 text-muted-foreground">
              Watch an introduction to our approach to marketing and business growth.
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
            <h2 className="text-3xl font-black tracking-tight sm:text-5xl">A focused tool for a real business goal.</h2>
            <p className="leading-7 text-muted-foreground">
              AMS sells specific business jobs, not a vague promise that one bot can do everything. These are the capabilities currently associated with {agent.name}.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {agent.status === "live" ? agent.capabilities.map((capability) => (
              <Card key={capability}>
                <CardHeader>
                  <Sparkles className="mb-2 h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">{capability}</CardTitle>
                </CardHeader>
              </Card>
            )) : <p className="text-muted-foreground">This service is not yet available to purchase.</p>}
          </div>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-8 lg:py-20">
        <div className="mx-auto max-w-7xl space-y-8">
          <div className="max-w-3xl space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">How it works</p>
            <h2 className="text-3xl font-black tracking-tight sm:text-5xl">Three simple steps to get started.</h2>
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

      <section className="border-y border-border/70 bg-muted/20 px-5 py-12 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <Card>
            <CardHeader>
              <ShieldCheck className="h-5 w-5 text-primary" />
              <CardTitle>Clear availability. You stay in control.</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-7 text-muted-foreground">
              <p>{customerOfferDescription(agent)}</p>
              <p>Services not yet available cannot be purchased. You review customer-facing content before using it.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {related.length ? (
        <section className="px-5 py-14 sm:px-8 lg:py-20">
          <div className="mx-auto max-w-7xl space-y-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Explore more</p>
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
                      <CardDescription className="leading-6">{customerAgentDescription(candidate)}</CardDescription>
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
            <p className="leading-7 text-muted-foreground">{customerOfferDescription(agent)}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Button asChild size="lg"><Link href={offer.primaryHref}>{offer.primaryLabel}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/agents">Agent store</Link></Button>
          </div>
        </div>
      </section>
    </main>
      <AmsPublicFooter />
    </>
  )
}
