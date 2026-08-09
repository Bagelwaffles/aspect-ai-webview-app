"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  FlaskConical,
  LockKeyhole,
  Rocket,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type AgentStatus = "live" | "beta" | "in-development" | "coming-soon"
type AgentCategory =
  | "Marketing"
  | "Sales"
  | "Automation"
  | "Content"
  | "Commerce"
  | "Operations"
  | "Research"
  | "Creator"
  | "Platform"

type Agent = {
  name: string
  category: AgentCategory
  status: AgentStatus
  description: string
  capabilities: string[]
  href?: string
  internal?: boolean
}

const agents: Agent[] = [
  {
    name: "Content Agent",
    category: "Content",
    status: "in-development",
    description: "The first intended customer-facing AMS agent, focused on practical marketing and business content generation.",
    capabilities: ["Marketing copy", "Product descriptions", "Email drafts", "Social content"],
    href: "/content-agent",
  },
  {
    name: "AMS Fiverr Bridge",
    category: "Sales",
    status: "beta",
    description: "A controlled automation layer for classifying Fiverr activity and routing approved events into AMS workflows.",
    capabilities: ["Lead classification", "Order-event handling", "Safety gates", "Workflow routing"],
    internal: true,
  },
  {
    name: "Aspect Overmind",
    category: "Platform",
    status: "in-development",
    description: "The orchestration layer intended to coordinate specialized AMS agents, tools, and operator-approved actions.",
    capabilities: ["Agent routing", "Task coordination", "Tool orchestration", "Operator controls"],
    internal: true,
  },
  {
    name: "YouTube Uploader Agent",
    category: "Creator",
    status: "in-development",
    description: "A controlled publishing workflow for preparing and uploading video assets through owner-authorized channels.",
    capabilities: ["Video upload", "Metadata", "Thumbnail workflow", "Publishing controls"],
    internal: true,
  },
  {
    name: "Social Publisher Agent",
    category: "Marketing",
    status: "in-development",
    description: "Approval-first social publishing infrastructure designed for controlled multi-platform distribution.",
    capabilities: ["Post validation", "Approval gates", "Platform routing", "Publishing status"],
    internal: true,
  },
  {
    name: "Android Build Agent",
    category: "Platform",
    status: "in-development",
    description: "Build automation for Android application packaging and future Google Play release workflows.",
    capabilities: ["APK builds", "AAB builds", "Release assets", "Build automation"],
  },
  {
    name: "Lead Magnet Agent",
    category: "Marketing",
    status: "coming-soon",
    description: "Planned lead-generation assistant for creating useful conversion assets around a business offer.",
    capabilities: ["Lead magnets", "Offer alignment", "Conversion assets", "Campaign support"],
  },
  {
    name: "Nurture Agent",
    category: "Marketing",
    status: "coming-soon",
    description: "Planned follow-up assistant for building structured prospect and customer nurture sequences.",
    capabilities: ["Follow-up sequences", "Lifecycle messaging", "Lead nurture", "Retention support"],
  },
  {
    name: "Outreach Agent",
    category: "Sales",
    status: "coming-soon",
    description: "Planned outreach assistant for qualification, positioning, and human-reviewed prospect communication.",
    capabilities: ["Lead qualification", "Offer positioning", "Outreach drafts", "Follow-up support"],
  },
  {
    name: "Sales Agent",
    category: "Sales",
    status: "coming-soon",
    description: "Planned sales assistant for discovery, qualification, recommendation, and next-step routing.",
    capabilities: ["Discovery", "Qualification", "Recommendations", "Handoff routing"],
  },
  {
    name: "Marketing Audit Agent",
    category: "Marketing",
    status: "coming-soon",
    description: "Planned diagnostic agent for turning business inputs into a structured marketing assessment and action plan.",
    capabilities: ["Marketing review", "Gap analysis", "Priority actions", "Growth planning"],
  },
  {
    name: "Analytics Agent",
    category: "Operations",
    status: "coming-soon",
    description: "Planned analytics assistant for interpreting authorized business data and surfacing actionable insights.",
    capabilities: ["Data analysis", "Reporting", "Trend detection", "Recommendations"],
  },
  {
    name: "Automation Builder",
    category: "Automation",
    status: "coming-soon",
    description: "Planned workflow-building assistant for mapping repetitive processes into controlled automations.",
    capabilities: ["Process mapping", "Workflow design", "Trigger planning", "Integration logic"],
  },
  {
    name: "n8n Automation Agent",
    category: "Automation",
    status: "coming-soon",
    description: "Planned customer-facing assistant for designing, reviewing, and improving n8n-based business workflows.",
    capabilities: ["n8n workflows", "Webhook design", "Integration planning", "Failure-path review"],
  },
  {
    name: "SEO Agent",
    category: "Marketing",
    status: "coming-soon",
    description: "Planned SEO assistant for structured optimization recommendations and content planning.",
    capabilities: ["SEO review", "Keyword planning", "Content briefs", "Optimization guidance"],
  },
  {
    name: "Affiliate Marketing Agent",
    category: "Marketing",
    status: "coming-soon",
    description: "Planned affiliate-growth assistant for campaign structure, offer positioning, and promotional workflows.",
    capabilities: ["Affiliate campaigns", "Offer positioning", "Content support", "Tracking plans"],
  },
  {
    name: "Shopify Agent",
    category: "Commerce",
    status: "coming-soon",
    description: "Planned commerce assistant for Shopify catalog, merchandising, and store workflow support.",
    capabilities: ["Catalog support", "Store workflows", "Merchandising", "Automation planning"],
  },
  {
    name: "Product Creator Agent",
    category: "Commerce",
    status: "coming-soon",
    description: "Planned product-development assistant for turning concepts into structured digital or commerce-ready offers.",
    capabilities: ["Product concepts", "Offer packaging", "Listing support", "Launch assets"],
  },
  {
    name: "Video Agent",
    category: "Creator",
    status: "coming-soon",
    description: "Planned video workflow assistant for scripting, metadata, production handoff, and publishing preparation.",
    capabilities: ["Scripts", "Metadata", "Production handoff", "Publishing prep"],
  },
  {
    name: "Twitch Watcher Agent",
    category: "Creator",
    status: "coming-soon",
    description: "Planned creator assistant for stream monitoring, summaries, clip opportunities, and publishing handoffs.",
    capabilities: ["Stream monitoring", "Summaries", "Clip discovery", "Creator alerts"],
  },
  {
    name: "Customer Support Agent",
    category: "Operations",
    status: "coming-soon",
    description: "Planned support assistant for triage, knowledge-guided responses, and escalation to a human operator.",
    capabilities: ["Triage", "Response drafting", "Knowledge lookup", "Escalation"],
  },
  {
    name: "Technical Support Agent",
    category: "Operations",
    status: "coming-soon",
    description: "Planned technical support assistant for structured troubleshooting and operator-approved remediation guidance.",
    capabilities: ["Issue triage", "Troubleshooting", "Diagnostics", "Escalation"],
  },
  {
    name: "Notifier Agent",
    category: "Operations",
    status: "coming-soon",
    description: "Planned notification assistant for routing important business events to the right channel and operator.",
    capabilities: ["Event alerts", "Routing rules", "Escalations", "Delivery status"],
  },
  {
    name: "Slack Agent",
    category: "Operations",
    status: "coming-soon",
    description: "Planned workspace assistant for summaries, alerts, structured commands, and approved operational actions.",
    capabilities: ["Slack summaries", "Alerts", "Commands", "Operational handoffs"],
  },
  {
    name: "Telegram Agent",
    category: "Operations",
    status: "coming-soon",
    description: "Planned messaging assistant for Telegram-triggered workflows, notifications, and controlled commands.",
    capabilities: ["Telegram triggers", "Notifications", "Workflow handoff", "Command routing"],
  },
  {
    name: "Web Scraper Agent",
    category: "Research",
    status: "coming-soon",
    description: "Planned research assistant for collecting permitted public web information into structured business inputs.",
    capabilities: ["Public web research", "Extraction", "Normalization", "Research handoff"],
  },
  {
    name: "Research Agent",
    category: "Research",
    status: "coming-soon",
    description: "Planned general research assistant for evidence gathering, comparison, synthesis, and source-aware briefs.",
    capabilities: ["Research", "Comparison", "Synthesis", "Source briefs"],
  },
  {
    name: "Reverse-Engineering Intelligence Agent",
    category: "Research",
    status: "coming-soon",
    description: "Planned product-intelligence assistant for monitoring public releases, changelogs, and implementation patterns.",
    capabilities: ["Release monitoring", "Changelog review", "Pattern analysis", "Improvement briefs"],
  },
  {
    name: "AGI Research Bot",
    category: "Research",
    status: "coming-soon",
    description: "Planned research-oriented agent for tracking AI developments and organizing findings for AMS operators.",
    capabilities: ["AI research", "Trend monitoring", "Briefing", "Knowledge organization"],
  },
  {
    name: "Console Builder",
    category: "Platform",
    status: "coming-soon",
    description: "Planned platform assistant for generating controlled internal dashboards and business interfaces.",
    capabilities: ["Dashboard planning", "UI scaffolding", "Operator tools", "System views"],
  },
  {
    name: "Meme-to-Agent",
    category: "Platform",
    status: "coming-soon",
    description: "Experimental concept for turning structured creative prompts into safe, scoped agent prototypes.",
    capabilities: ["Concept intake", "Agent scoping", "Prototype planning", "Safety boundaries"],
  },
  {
    name: "Agent Battle Arena",
    category: "Platform",
    status: "coming-soon",
    description: "Experimental evaluation concept for comparing agent outputs against defined quality and task criteria.",
    capabilities: ["Agent comparison", "Quality scoring", "Evaluation runs", "Benchmark views"],
    internal: true,
  },
]

const statusMeta: Record<
  AgentStatus,
  { label: string; description: string; icon: typeof Bot; badgeClass: string; dotClass: string }
> = {
  live: {
    label: "Live",
    description: "Verified and generally available.",
    icon: CheckCircle2,
    badgeClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    dotClass: "bg-emerald-400",
  },
  beta: {
    label: "Beta",
    description: "Working in controlled testing; not generally available.",
    icon: FlaskConical,
    badgeClass: "border-sky-500/30 bg-sky-500/10 text-sky-300",
    dotClass: "bg-sky-400",
  },
  "in-development": {
    label: "In Development",
    description: "Actively being built or hardened.",
    icon: Wrench,
    badgeClass: "border-violet-500/30 bg-violet-500/10 text-violet-300",
    dotClass: "bg-violet-400",
  },
  "coming-soon": {
    label: "Coming Soon",
    description: "Approved roadmap capability; not currently available.",
    icon: Clock3,
    badgeClass: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    dotClass: "bg-amber-400",
  },
}

const categoryOptions = [
  "All",
  "Marketing",
  "Sales",
  "Automation",
  "Content",
  "Commerce",
  "Operations",
  "Research",
  "Creator",
  "Platform",
] as const

const statusOptions = ["All", "live", "beta", "in-development", "coming-soon"] as const

type CategoryFilter = (typeof categoryOptions)[number]
type StatusFilter = (typeof statusOptions)[number]

export default function AgentsPage() {
  const [category, setCategory] = useState<CategoryFilter>("All")
  const [status, setStatus] = useState<StatusFilter>("All")

  const filteredAgents = useMemo(
    () =>
      agents.filter((agent) => {
        const categoryMatch = category === "All" || agent.category === category
        const statusMatch = status === "All" || agent.status === status
        return categoryMatch && statusMatch
      }),
    [category, status],
  )

  const counts = useMemo(
    () => ({
      live: agents.filter((agent) => agent.status === "live").length,
      beta: agents.filter((agent) => agent.status === "beta").length,
      "in-development": agents.filter((agent) => agent.status === "in-development").length,
      "coming-soon": agents.filter((agent) => agent.status === "coming-soon").length,
    }),
    [],
  )

  return (
    <main className="min-h-screen bg-background">
      <section className="relative overflow-hidden border-b border-border/70 px-5 py-16 sm:px-8 lg:py-24">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(124,58,237,0.18),transparent_34%),radial-gradient(circle_at_85%_18%,rgba(59,130,246,0.10),transparent_30%)]" />
        <div className="relative mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
            <div>
              <Badge variant="outline" className="mb-5 border-primary/30 bg-primary/10 text-primary">
                <Sparkles className="mr-2 h-3.5 w-3.5" />
                Aspect Agent Network
              </Badge>
              <h1 className="max-w-4xl text-4xl font-black tracking-tight sm:text-6xl lg:text-7xl">
                Specialized AI systems for the work businesses actually need done.
              </h1>
              <p className="mt-6 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
                Explore the AMS agent roadmap across marketing, automation, sales, content, commerce, research, creator tools, and platform operations. Every agent is labeled by its real lifecycle state so planned capability is never presented as verified production functionality.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href="/contact">
                    Request early access <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/pricing">View AMS plans</Link>
                </Button>
              </div>
            </div>

            <Card className="border-primary/20 bg-card/80 shadow-2xl shadow-primary/5 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  Availability standard
                </CardTitle>
                <CardDescription className="leading-6">
                  AMS only marks an agent Live after its execution path, authentication, persistence, failure handling, and customer experience are verified.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(Object.keys(statusMeta) as AgentStatus[]).map((key) => {
                  const meta = statusMeta[key]
                  return (
                    <div key={key} className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-background/40 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className={`h-2.5 w-2.5 rounded-full ${meta.dotClass}`} />
                        <span className="text-sm font-medium">{meta.label}</span>
                      </div>
                      <span className="text-xl font-black tabular-nums">{counts[key]}</span>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="px-5 py-10 sm:px-8">
        <div className="mx-auto max-w-7xl space-y-8">
          <div className="rounded-2xl border border-border/70 bg-card/50 p-5 shadow-sm">
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Filter by category</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {categoryOptions.map((option) => (
                    <Button
                      key={option}
                      type="button"
                      size="sm"
                      variant={category === option ? "default" : "outline"}
                      onClick={() => setCategory(option)}
                      className="rounded-full"
                    >
                      {option}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Filter by lifecycle</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {statusOptions.map((option) => {
                    const label = option === "All" ? "All statuses" : statusMeta[option].label
                    return (
                      <Button
                        key={option}
                        type="button"
                        size="sm"
                        variant={status === option ? "secondary" : "ghost"}
                        onClick={() => setStatus(option)}
                        className="rounded-full"
                      >
                        {label}
                      </Button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Agent catalog</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{filteredAgents.length} agents in view</h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-muted-foreground">
              Internal infrastructure agents are shown at a high level only. Operational details, credentials, security controls, and privileged implementation data remain private.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredAgents.map((agent) => {
              const meta = statusMeta[agent.status]
              const StatusIcon = meta.icon

              return (
                <Card
                  key={agent.name}
                  className="group flex h-full flex-col overflow-hidden border-border/70 bg-card/70 transition-all duration-200 hover:-translate-y-1 hover:border-primary/35 hover:shadow-2xl hover:shadow-primary/5"
                >
                  <CardHeader className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary shadow-inner">
                        <Bot className="h-6 w-6" />
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        {agent.internal ? (
                          <Badge variant="outline" className="border-border/80 bg-muted/30 text-muted-foreground">
                            <LockKeyhole className="mr-1 h-3 w-3" /> Internal
                          </Badge>
                        ) : null}
                        <Badge variant="outline" className={meta.badgeClass}>
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {meta.label}
                        </Badge>
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{agent.category}</div>
                      <CardTitle className="text-xl">{agent.name}</CardTitle>
                      <CardDescription className="mt-2 min-h-16 leading-6">{agent.description}</CardDescription>
                    </div>
                  </CardHeader>

                  <CardContent className="flex flex-1 flex-col justify-between gap-6">
                    <div className="flex flex-wrap gap-2">
                      {agent.capabilities.map((capability) => (
                        <Badge key={capability} variant="secondary" className="font-normal">
                          {capability}
                        </Badge>
                      ))}
                    </div>

                    <div className="border-t border-border/60 pt-4">
                      <div className="mb-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${meta.dotClass}`} />
                        <span>{meta.description}</span>
                      </div>
                      <Button asChild variant={agent.href ? "default" : "outline"} className="w-full">
                        <Link href={agent.href ?? "/contact"}>
                          {agent.href ? "View agent status" : agent.status === "coming-soon" ? "Request early access" : "Ask about this agent"}
                          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {filteredAgents.length === 0 ? (
            <Card className="border-dashed py-12 text-center">
              <CardContent>
                <Rocket className="mx-auto h-8 w-8 text-muted-foreground" />
                <h3 className="mt-4 text-xl font-bold">No agents match these filters yet.</h3>
                <p className="mt-2 text-sm text-muted-foreground">Try another lifecycle or category to explore the broader roadmap.</p>
              </CardContent>
            </Card>
          ) : null}

          <Card className="overflow-hidden border-primary/20 bg-primary/5">
            <CardContent className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <Badge variant="outline" className="border-primary/30 bg-background/30 text-primary">
                  Early access
                </Badge>
                <h2 className="mt-4 text-2xl font-black sm:text-3xl">See an agent your business needs?</h2>
                <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
                  Tell AMS which capability matters to you. Early-access demand helps determine which agents move through development and verification first.
                </p>
              </div>
              <Button asChild size="lg">
                <Link href="/contact">
                  Request an agent <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-3 border-t border-border/70 pt-8">
            <Button asChild variant="outline">
              <Link href="/">Back home</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/billing">Account billing</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  )
}
