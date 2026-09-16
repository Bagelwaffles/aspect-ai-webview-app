import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  BarChart3,
  Clapperboard,
  Gamepad2,
  Scissors,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "AMS for Creators | Streaming & Gaming Growth Tools",
  description:
    "Explore the AMS creator roadmap: streamer planning, clip strategy, short-form packaging, performance review, collaboration tracking, and creator-safety workflows. The Streamer Agent is currently a controlled pilot and is not sold as a finished SaaS product.",
  alternates: {
    canonical: "https://www.aspectmarketingsolutions.app/creators",
  },
  openGraph: {
    title: "AMS for Creators | Streaming & Gaming Growth Tools",
    description:
      "A creator-focused AMS vertical for stream planning, clip strategy, short-form packaging, analytics review, and safer channel growth.",
    url: "https://www.aspectmarketingsolutions.app/creators",
    siteName: "Aspect Marketing Solutions",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AMS for Creators | Streaming & Gaming Growth Tools",
    description:
      "A creator-focused AMS vertical for stream planning, clip strategy, short-form packaging, analytics review, and safer channel growth.",
  },
}

const creatorJobs = [
  {
    icon: Gamepad2,
    title: "Plan the stream",
    copy: "Build a weekly creator brief with game opportunities, stream angles, titles, challenges, and specific moments worth clipping.",
  },
  {
    icon: Scissors,
    title: "Find the clips",
    copy: "Score highlights for hook, action, reaction, payoff, humor, and replay value before deciding what deserves a Short or TikTok.",
  },
  {
    icon: Clapperboard,
    title: "Package short-form content",
    copy: "Turn strong moments into platform-ready hooks, titles, captions, series concepts, and posting experiments without flooding channels with weak footage.",
  },
  {
    icon: BarChart3,
    title: "Learn what is winning",
    copy: "Review available views, watch time, completion, likes, comments, shares, follower growth, and posting windows without inventing missing analytics.",
  },
  {
    icon: Users,
    title: "Build repeatable community formats",
    copy: "Create recognizable series, audience rituals, viewer-voted challenges, collaboration watchlists, and milestone tracking that reward returning viewers.",
  },
  {
    icon: ShieldCheck,
    title: "Protect the creator",
    copy: "Keep privacy, account security, copyright discipline, moderation, and human-controlled publishing inside the workflow from the start.",
  },
]

const pilotPrinciples = [
  "No capture card required to start planning and clipping workflows.",
  "No automatic publishing or account mutation is represented as working until it is actually verified.",
  "No fabricated analytics, fake growth claims, or guaranteed reach.",
  "No forced trend chasing when the creator's actual audience and enjoyment point somewhere else.",
]

export default function CreatorsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70 bg-background/95 px-5 py-4 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 font-black tracking-tight">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary">A</span>
            <span>ASPECT<span className="text-primary">/</span>AMS</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <Link className="hover:text-foreground" href="/agents">Agent Store</Link>
            <Link className="hover:text-foreground" href="/pricing">Pricing</Link>
            <Link className="hover:text-foreground" href="/contact">Contact</Link>
          </nav>
        </div>
      </header>

      <section className="border-b border-border/70 px-5 py-16 sm:px-8 lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">AMS Creators</Badge>
              <Badge variant="outline">Gaming first</Badge>
              <Badge variant="outline">Controlled pilot</Badge>
            </div>

            <div className="space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Creator growth system</p>
              <h1 className="max-w-5xl text-4xl font-black tracking-tight sm:text-6xl lg:text-7xl">
                Give streamers a <span className="text-primary">producer system</span>, not another pile of generic advice.
              </h1>
              <p className="max-w-3xl text-lg leading-8 text-muted-foreground">
                AMS for Creators organizes stream planning, clip selection, short-form packaging, performance review, community formats, and creator-safety checks into one repeatable workflow.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/agents/twitch-watcher-agent">Review Streamer Agent status<ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/contact">Ask about the creator pilot</Link>
              </Button>
            </div>
          </div>

          <Card className="border-primary/25 bg-primary/5 shadow-xl">
            <CardHeader>
              <CardDescription>Commercial boundary</CardDescription>
              <CardTitle className="text-3xl sm:text-4xl">Pilot first. Sell after proof.</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 text-sm leading-6 text-muted-foreground">
              <p>
                The Streamer Agent workflow is being exercised as a controlled creator pilot. AMS is not presenting it as a finished paid SaaS agent until the customer-facing execution path, data handling, and channel integrations are verified end to end.
              </p>
              <div className="border-t border-border/70 pt-5">
                <p className="font-semibold text-foreground">Current goal</p>
                <p className="mt-2">Prove the planning, clip, analytics, and creator-operations loop before attaching a subscription price or automated publishing promise.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-8 lg:py-20">
        <div className="mx-auto max-w-7xl space-y-8">
          <div className="max-w-3xl space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">What the creator system does</p>
            <h2 className="text-3xl font-black tracking-tight sm:text-5xl">From live session to a smarter next stream.</h2>
            <p className="leading-7 text-muted-foreground">
              Gaming is the first vertical because streamers generate a constant flow of moments, clips, audience signals, and repeatable series ideas. The same operating model can later expand to other creator categories.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {creatorJobs.map(({ icon: Icon, title, copy }) => (
              <Card key={title}>
                <CardHeader>
                  <Icon className="mb-2 h-5 w-5 text-primary" />
                  <CardTitle>{title}</CardTitle>
                  <CardDescription className="leading-6">{copy}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border/70 bg-muted/20 px-5 py-14 sm:px-8 lg:py-20">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">The first product lane</p>
            <h2 className="text-3xl font-black tracking-tight sm:text-5xl">Streamer Agent</h2>
            <p className="leading-7 text-muted-foreground">
              The existing Twitch/creator roadmap agent is the foundation for the Streamer Agent concept: a producer-style workflow for planning streams, identifying clip opportunities, packaging short-form content, tracking milestones, and learning from real performance data.
            </p>
            <Button asChild variant="outline">
              <Link href="/agents/twitch-watcher-agent">Open the roadmap agent<ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>

          <Card>
            <CardHeader>
              <Sparkles className="mb-2 h-5 w-5 text-primary" />
              <CardDescription>Designed around a repeatable loop</CardDescription>
              <CardTitle>Plan → Stream → Clip → Publish → Learn</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {[
                ["Plan", "Choose the game, premise, title, challenge, and moments worth hunting."],
                ["Stream", "Keep the creator focused on playing while the workflow preserves the content plan."],
                ["Clip", "Rank strong moments instead of treating every capture as publishable."],
                ["Publish", "Prepare hooks, captions, titles, and platform-specific packaging for human review."],
                ["Learn", "Use actual channel data to double down on formats that earn attention and repeat viewers."],
                ["Grow", "Track milestones, collaborations, audience rituals, and monetization readiness without rushing them."],
              ].map(([title, copy]) => (
                <div className="rounded-xl border border-border bg-background p-4" key={title}>
                  <div className="font-bold text-foreground">{title}</div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-8 lg:py-20">
        <div className="mx-auto max-w-7xl space-y-8">
          <div className="max-w-3xl space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Pilot rules</p>
            <h2 className="text-3xl font-black tracking-tight sm:text-5xl">Proof before automation theater.</h2>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {pilotPrinciples.map((principle) => (
              <Card key={principle}>
                <CardContent className="flex gap-3 pt-6">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <ShieldCheck className="h-3.5 w-3.5" />
                  </span>
                  <p className="leading-7 text-muted-foreground">{principle}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border/70 bg-primary/5 px-5 py-14 sm:px-8 lg:py-20">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="max-w-3xl space-y-2">
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Creators are a new AMS lane, not a distraction from the core business.</h2>
            <p className="leading-7 text-muted-foreground">
              The creator vertical reuses AMS's agent, analytics, content, and approval-first principles while keeping business marketing products and creator workflows clearly separated.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Button asChild size="lg"><Link href="/contact">Ask about the pilot<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/agents">Agent Store</Link></Button>
          </div>
        </div>
      </section>
    </main>
  )
}
