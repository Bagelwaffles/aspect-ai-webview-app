import { AmsPublicHeader } from "@/components/ams-public-header"
import { AmsPublicFooter } from "@/components/ams-public-footer"
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
  title: "AMS Creator OS | Streaming & Gaming Operations Platform",
  description:
    "Explore the AMS Creator OS roadmap for stream planning, clip operations, gaming intelligence, analytics, publishing, community, collaboration, monetization, safety, and professional creator workflows. The Streamer Agent remains a controlled pilot until its customer execution path is verified end to end.",
  alternates: {
    canonical: "https://www.aspectmarketingsolutions.app/creators",
  },
  openGraph: {
    title: "AMS Creator OS | Streaming & Gaming Operations Platform",
    description:
      "A professional creator operating system for planning streams, finding clips, packaging content, learning from performance, and coordinating the systems behind a growing gaming channel.",
    url: "https://www.aspectmarketingsolutions.app/creators",
    siteName: "Aspect Marketing Solutions",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AMS Creator OS | Streaming & Gaming Operations Platform",
    description:
      "A professional creator operating system for streaming, clips, analytics, publishing, community, collaborations, monetization, and creator safety.",
  },
}

type ModuleStatus = "Pilot" | "Integration required" | "Roadmap"

type CreatorModule = {
  icon: typeof Gamepad2
  title: string
  status: ModuleStatus
  summary: string
  capabilities: string[]
}

const statusStyle: Record<ModuleStatus, string> = {
  Pilot: "border-primary/30 bg-primary/10 text-primary",
  "Integration required": "border-amber-500/30 bg-amber-500/10 text-amber-300",
  Roadmap: "border-border bg-muted/40 text-muted-foreground",
}

const creatorModules: CreatorModule[] = [
  {
    icon: Users,
    title: "Creator Profile & Brand System",
    status: "Pilot",
    summary: "Keep the operating context that makes every recommendation feel like the same creator instead of a fresh generic prompt.",
    capabilities: [
      "Creator handle, platforms, games, genres, goals, and schedule",
      "Brand voice, visual identity, recurring formats, and audience rituals",
      "Equipment and capture setup with upgrade recommendations only when useful",
      "Team, collaborator, privacy, rights, and safety preferences",
    ],
  },
  {
    icon: Gamepad2,
    title: "Stream Planner",
    status: "Pilot",
    summary: "Turn a gaming session into a planned piece of entertainment with a premise, hooks, challenges, and moments worth hunting.",
    capabilities: [
      "Weekly stream briefs and game-angle recommendations",
      "Titles, categories, descriptions, tags, challenges, and run-of-show",
      "Pre-stream checks and post-stream capture checklist",
      "Recurring series, sibling/co-op formats, milestones, and growth experiments",
    ],
  },
  {
    icon: Sparkles,
    title: "Gaming Intelligence",
    status: "Pilot",
    summary: "Use current game changes as content opportunities without blindly chasing every trend.",
    capabilities: [
      "Patch, season, event, update, release, and free-weekend watch",
      "PS Plus, Game Pass, cross-play, scenario, and server opportunity tracking",
      "Embargo, NDA, confidential-beta, and streaming-permission warnings",
      "Trend ideas grounded in current information instead of stale game knowledge",
    ],
  },
  {
    icon: Scissors,
    title: "VOD & Clip Lab",
    status: "Pilot",
    summary: "Treat every recording as raw inventory and rank only the moments that deserve editing and distribution.",
    capabilities: [
      "Uploaded clip review for hook, action, reaction, humor, payoff, and replay value",
      "Moment ranking, timestamp notes, clip naming, and best-of vault decisions",
      "Vertical-short concepts, opening hooks, titles, captions, and series packaging",
      "Direct Twitch/YouTube VOD ingestion and automated moment detection remain roadmap work",
    ],
  },
  {
    icon: Clapperboard,
    title: "Editing & Media Studio",
    status: "Roadmap",
    summary: "Build a repeatable post-production system rather than editing every clip from scratch.",
    capabilities: [
      "Aspect-ratio variants, crop/safe-zone guidance, captions, subtitles, and accessibility",
      "Intros, outros, stingers, overlays, alerts, panels, thumbnails, and reusable templates",
      "Music-rights checks, sponsor disclosure prompts, and export-quality validation",
      "Asset versioning, duplicate detection, approval states, and reusable media library",
    ],
  },
  {
    icon: Clapperboard,
    title: "Publishing Hub",
    status: "Integration required",
    summary: "Prepare one strong moment for multiple channels while keeping every external account action behind explicit controls.",
    capabilities: [
      "TikTok, YouTube Shorts, YouTube long-form, Twitch clips/highlights, Reels, and optional social distribution",
      "Drafts, schedules, platform-specific metadata, retries, and publish-status tracking",
      "Campaign/source attribution where appropriate",
      "AMS has publishing foundations, but creator-account connectors are not represented as production-ready until separately verified",
    ],
  },
  {
    icon: BarChart3,
    title: "Analytics & Growth Lab",
    status: "Integration required",
    summary: "Make the next content decision from actual performance data instead of vanity metrics or invented analytics.",
    capabilities: [
      "Views, watch time, retention/completion, CTR, engagement, and follower growth",
      "Game, hook, format, clip-length, posting-window, and recurring-series comparisons",
      "Repeat-viewer signals, stream-to-short funnel, milestones, and weekly experiments",
      "A/B test planning for hooks, titles, thumbnails, and packaging",
    ],
  },
  {
    icon: Users,
    title: "Community & Moderation",
    status: "Roadmap",
    summary: "Turn viewers into a recognizable community without automating high-impact moderation decisions blindly.",
    capabilities: [
      "Audience rituals, polls, challenges, viewer-voted ideas, and comment-to-content prompts",
      "Moderation playbooks, spam/harassment escalation, banned-term controls, and safety boundaries",
      "Discord/community planning and recurring-viewer recognition",
      "No automatic bans, DMs, or moderation actions without verified controls and human override",
    ],
  },
  {
    icon: Users,
    title: "Collaboration CRM",
    status: "Roadmap",
    summary: "Remember who has good chemistry, what was discussed, and what a future collaboration would actually need.",
    capabilities: [
      "Collaborator watchlist, chemistry notes, availability, platform, and game overlap",
      "Outreach drafts, co-stream plans, run-of-show, permissions, and asset exchange",
      "Collaboration outcomes and repeat-partner tracking",
      "No automatic outreach or account messaging without creator approval",
    ],
  },
  {
    icon: BarChart3,
    title: "Monetization & Sponsorship Desk",
    status: "Roadmap",
    summary: "Add revenue systems only when the audience is strong enough to support them.",
    capabilities: [
      "Affiliate, membership, subscription, merch, donation/tip, and sponsor readiness",
      "Media kit, rate-card inputs, sponsor CRM, deliverables, deadlines, and campaign evidence",
      "Revenue and payout reporting without exposing payment credentials",
      "Disclosure, affiliate, sponsorship, and platform-policy reminders",
    ],
  },
  {
    icon: Gamepad2,
    title: "Stream Tech & Production",
    status: "Roadmap",
    summary: "Support direct-console creators first, then add professional production tooling when the channel actually benefits from it.",
    capabilities: [
      "PS5/direct-console workflows, capture-card readiness, OBS/Streamlabs setup, and scene planning",
      "Mic/audio routing, bitrate, resolution, network, lighting, webcam, and local-recording checks",
      "Hotkeys, Stream Deck concepts, backups, chat overlays, and notification privacy",
      "Hardware is treated as an optimization, not a prerequisite for creating content",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Safety, Rights & Account Security",
    status: "Pilot",
    summary: "Protect the creator, the channel, and the content before automation increases the blast radius of a mistake.",
    capabilities: [
      "2FA, recovery-code, least-privilege OAuth, and accidental-screen-exposure discipline",
      "PII, payment screen, private-message, location, notification, and account-email protection",
      "Copyright music, VOD muting, claims, sponsor disclosure, NDA, and embargo checks",
      "Approval gates, auditability, data-retention, export/delete, and integration-permission roadmap",
    ],
  },
]

const platformFoundations = [
  "Creator workspaces, profiles, projects, campaigns, and role-based team access",
  "Media uploads, asset library, versioning, best-of vault, and eventual export/delete controls",
  "Job queue, retries, idempotency, rate limits, failure states, and observability",
  "Human approval queue before publishing, outreach, spending, moderation, or account mutation",
  "OAuth/integration layer with least-privilege permissions, revocation, and connection health",
  "Notifications, milestones, deadlines, sponsor obligations, and operational alerts",
  "Audit logs and execution evidence so the platform can prove what happened and what did not",
  "Feature flags and status labels so unfinished integrations fail closed instead of pretending to work",
  "Mobile-friendly workflows and compatibility with the broader AMS Android distribution strategy",
  "Documentation, onboarding, accessibility, support paths, privacy, retention, and security testing",
]

const pilotPrinciples = [
  "No capture card required to start planning and clipping workflows.",
  "No automatic publishing or account mutation is represented as working until it is actually verified.",
  "No fabricated analytics, fake growth claims, guaranteed reach, or fake monetization readiness.",
  "No forced trend chasing when the creator's real audience and enjoyment point somewhere else.",
  "No creator integration shares credentials with AMS business channels by default.",
  "No new paid Creator SKU until the customer-facing execution, persistence, failure handling, and support path are proven.",
]

export default function CreatorsPage() {
  return (
    <>
      <AmsPublicHeader />
      <main className="ams-public-page ams-public-page min-h-screen bg-background text-foreground">
      

      <section className="border-b border-border/70 px-5 py-16 sm:px-8 lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">AMS Creator OS</Badge>
              <Badge variant="outline">Gaming first</Badge>
              <Badge variant="outline">Controlled pilot</Badge>
            </div>

            <div className="space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Streaming + gaming operations platform</p>
              <h1 className="max-w-5xl text-4xl font-black tracking-tight sm:text-6xl lg:text-7xl">
                Run the channel like a <span className="text-primary">creator business</span> without killing the fun.
              </h1>
              <p className="max-w-3xl text-lg leading-8 text-muted-foreground">
                AMS Creator OS is the professional operating layer behind a streamer: planning, gaming intelligence, VOD and clip operations, editing, publishing, analytics, community, collaborations, monetization, production tech, safety, and the infrastructure required to make those systems reliable.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/creators/pilot">Apply for the Creator Pilot<ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/agents/twitch-watcher-agent">Review Streamer Agent status</Link>
              </Button>
            </div>
          </div>

          <Card className="border-primary/25 bg-primary/5 shadow-xl">
            <CardHeader>
              <CardDescription>Commercial boundary</CardDescription>
              <CardTitle className="text-3xl sm:text-4xl">Build the full platform. Sell only proven execution.</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 text-sm leading-6 text-muted-foreground">
              <p>
                The Creator OS roadmap is intentionally broader than what is customer-executable today. Every module below is labeled Pilot, Integration required, or Roadmap so a future buyer can see the difference between a tested workflow and a planned capability.
              </p>
              <div className="border-t border-border/70 pt-5">
                <p className="font-semibold text-foreground">Current objective</p>
                <p className="mt-2">Prove intake, planning, clip operations, real analytics, persistence, approvals, and creator-safe integrations before attaching a paid Creator subscription or automatic publishing promise.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-8 lg:py-20">
        <div className="mx-auto max-w-7xl space-y-8">
          <div className="max-w-4xl space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Full professional stack</p>
            <h2 className="text-3xl font-black tracking-tight sm:text-5xl">Everything a serious gaming creator eventually needs, organized in one operating system.</h2>
            <p className="leading-7 text-muted-foreground">
              These are platform modules, not new entries added to the 33-agent catalog. The existing Streamer/Twitch roadmap agent remains the agent foundation while Creator OS coordinates the wider workflow around it.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {creatorModules.map(({ icon: Icon, title, status, summary, capabilities }) => (
              <Card key={title} className="flex h-full flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <Icon className="mt-1 h-5 w-5 shrink-0 text-primary" />
                    <Badge variant="outline" className={statusStyle[status]}>{status}</Badge>
                  </div>
                  <CardTitle className="pt-2">{title}</CardTitle>
                  <CardDescription className="leading-6">{summary}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto">
                  <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
                    {capabilities.map((capability) => (
                      <li className="flex gap-2" key={capability}>
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <span>{capability}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border/70 bg-muted/20 px-5 py-14 sm:px-8 lg:py-20">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">The operating loop</p>
            <h2 className="text-3xl font-black tracking-tight sm:text-5xl">Plan → Stream → Capture → Clip → Publish → Learn → Grow</h2>
            <p className="leading-7 text-muted-foreground">
              The goal is not to replace the creator. It is to remove repetitive production and operations work while preserving the creator&apos;s voice, judgment, safety, and final approval.
            </p>
            <Button asChild variant="outline">
              <Link href="/creators/pilot">Join the controlled pilot<ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>

          <Card>
            <CardHeader>
              <Sparkles className="mb-2 h-5 w-5 text-primary" />
              <CardDescription>Creator-first workflow</CardDescription>
              <CardTitle>One strong stream should compound into future content and better decisions.</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {[
                ["Plan", "Choose the game, premise, title, challenge, collaborators, sponsor obligations, and moments worth hunting."],
                ["Stream", "Keep the creator focused on playing while the system preserves the run-of-show and content targets."],
                ["Capture", "Preserve manual clips, trophy moments, local recordings, VOD references, and memorable timestamps."],
                ["Clip", "Rank the moments that earn attention instead of treating every recording as publishable."],
                ["Publish", "Prepare channel-specific edits, metadata, schedules, disclosures, and approval-ready drafts."],
                ["Learn", "Use real retention, engagement, growth, and conversion signals to decide what deserves another episode."],
                ["Community", "Turn viewers, comments, rituals, polls, challenges, and collaborations into repeatable programming."],
                ["Monetize", "Activate sponsor, affiliate, membership, merch, and revenue systems only when traction supports them."],
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
          <div className="max-w-4xl space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Platform foundations</p>
            <h2 className="text-3xl font-black tracking-tight sm:text-5xl">The infrastructure that keeps automation from becoming chaos.</h2>
            <p className="leading-7 text-muted-foreground">
              A professional platform needs far more than prompts. These are the operational foundations the Creator OS roadmap must preserve as integrations move from pilot to production.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {platformFoundations.map((foundation) => (
              <Card key={foundation}>
                <CardContent className="flex gap-3 pt-6">
                  <ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-primary" />
                  <p className="text-sm leading-6 text-muted-foreground">{foundation}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border/70 bg-muted/20 px-5 py-14 sm:px-8 lg:py-20">
        <div className="mx-auto max-w-7xl space-y-8">
          <div className="max-w-3xl space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Non-negotiable pilot rules</p>
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
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">The Creator OS is the product vision. The pilot is where we earn the right to sell it.</h2>
            <p className="leading-7 text-muted-foreground">
              Real creators give us the evidence needed to harden intake, media handling, analytics, integrations, approvals, safety, and support before AMS turns this into another paid software lane.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Button asChild size="lg"><Link href="/creators/pilot">Apply for the pilot<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/agents">Agent Store</Link></Button>
          </div>
        </div>
      </section>
    </main>
      <AmsPublicFooter />
    </>
  )
}
