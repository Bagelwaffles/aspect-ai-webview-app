"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import styles from "./agents.module.css"

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

const statusMeta: Record<AgentStatus, { label: string; description: string; visual: string }> = {
  live: {
    label: "Live",
    description: "Verified end to end and generally available to the intended customer group.",
    visual: "live",
  },
  beta: {
    label: "Beta",
    description: "Working in controlled testing with restricted availability and active monitoring.",
    visual: "beta",
  },
  "in-development": {
    label: "In Development",
    description: "Actively being built, integrated, tested, or hardened before customer availability.",
    visual: "development",
  },
  "coming-soon": {
    label: "Coming Soon",
    description: "Approved roadmap capability. It is visible for planning and demand signals, not sold as working functionality.",
    visual: "soon",
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

const operatingSteps = [
  ["01", "Start with the business outcome", "AMS begins with the result that matters: more qualified demand, less repetitive work, faster publishing, cleaner follow-up, or better operational visibility."],
  ["02", "Route work to a specialist", "The network model keeps agents scoped. A content task should not pretend to be billing, support, research, and orchestration at the same time."],
  ["03", "Keep controls around execution", "Sensitive actions, publishing, credentials, payments, and privileged system changes stay behind explicit authorization and verification boundaries."],
  ["04", "Record what actually happened", "The future Command Center is designed around real runs, real status, failure visibility, usage, and traceable handoffs instead of decorative activity."],
]

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
    <main className={styles.network}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="Aspect Marketing Solutions home">
          <span className={styles.brandMark}>A</span>
          <span className={styles.brandText}>ASPECT<span>/</span>AMS</span>
        </Link>
        <nav className={styles.nav} aria-label="Agent Network navigation">
          <Link href="/">Home</Link>
          <a href="#lifecycle">Lifecycle</a>
          <a href="#catalog">Catalog</a>
          <Link href="/pricing">Pricing</Link>
        </nav>
        <Link className={styles.enter} href="/request-access">Enter the system ↗</Link>
      </header>

      <section className={styles.hero}>
        <p className={styles.kicker}><span className={styles.kickerDot} />Aspect Agent Network // transparent roadmap</p>
        <div className={styles.heroGrid}>
          <h1>The agent network.<span>Built to do the work.</span></h1>
          <div className={styles.heroCopy}>
            <p>
              AMS is organizing specialized AI and automation systems around real business jobs: create demand, qualify leads,
              publish content, connect workflows, support customers, research markets, operate commerce, and coordinate the platform behind it all.
              Every capability below carries an explicit lifecycle state so the roadmap is ambitious without pretending unfinished work is already a product.
            </p>
            <div className={styles.heroActions}>
              <a className={styles.primary} href="#catalog">Explore 32 agents <span>↓</span></a>
              <Link className={styles.secondary} href="/contact">Request early access <span>↗</span></Link>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.signal} aria-label="Current lifecycle counts">
        <div className={styles.signalItem} data-status="live"><span className={styles.signalLabel}>Live // verified</span><strong className={styles.signalValue}>{counts.live}</strong></div>
        <div className={styles.signalItem} data-status="beta"><span className={styles.signalLabel}>Beta // controlled</span><strong className={styles.signalValue}>{counts.beta}</strong></div>
        <div className={styles.signalItem} data-status="development"><span className={styles.signalLabel}>In development</span><strong className={styles.signalValue}>{counts["in-development"]}</strong></div>
        <div className={styles.signalItem} data-status="soon"><span className={styles.signalLabel}>Coming soon</span><strong className={styles.signalValue}>{counts["coming-soon"]}</strong></div>
      </section>

      <section className={styles.section} id="lifecycle">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.kicker}>Availability means something here</p>
            <h2>Roadmap labels with teeth.</h2>
          </div>
          <p>
            The agent count is an inventory of product concepts and active builds—not a claim that 32 autonomous products are running in production.
            AMS only moves a capability toward Live as the real execution path, authentication, persistence, failure handling, operator controls,
            and customer experience are verified. That distinction protects trust and gives customers a useful view of what exists, what is being hardened,
            and what they can influence next.
          </p>
        </div>

        <div className={styles.lifecycle}>
          {(Object.keys(statusMeta) as AgentStatus[]).map((key, index) => {
            const meta = statusMeta[key]
            return (
              <article className={styles.lifeCard} data-status={meta.visual} key={key}>
                <div className={styles.lifeTop}>
                  <span className={styles.lifeIndex}>0{index + 1}</span>
                  <span className={styles.lifePill}>{meta.label}</span>
                </div>
                <h3>{meta.label}</h3>
                <p>{meta.description}</p>
              </article>
            )
          })}
        </div>
      </section>

      <section className={`${styles.section} ${styles.catalogSection}`} id="catalog">
        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <p>Filter by business function</p>
            <div className={styles.filterRow}>
              {categoryOptions.map((option) => (
                <button
                  className={`${styles.filter} ${category === option ? styles.filterActive : ""}`}
                  key={option}
                  type="button"
                  onClick={() => setCategory(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.filterGroup}>
            <p>Filter by lifecycle</p>
            <div className={styles.filterRow}>
              {statusOptions.map((option) => (
                <button
                  className={`${styles.filter} ${status === option ? styles.filterActive : ""}`}
                  key={option}
                  type="button"
                  onClick={() => setStatus(option)}
                >
                  {option === "All" ? "All statuses" : statusMeta[option].label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.catalogHeading}>
          <div>
            <p className={styles.kicker}>Agent catalog</p>
            <h2>{filteredAgents.length} agents in view.</h2>
          </div>
          <p>
            Public cards explain the job, capability surface, and lifecycle. Internal agents stay intentionally high level; privileged architecture,
            credentials, security rules, and operator-only implementation details are not exposed here.
          </p>
        </div>

        {filteredAgents.length ? (
          <div className={styles.catalog}>
            {filteredAgents.map((agent, index) => {
              const meta = statusMeta[agent.status]
              return (
                <article className={styles.card} data-status={meta.visual} key={agent.name}>
                  <div className={styles.cardTop}>
                    <span className={styles.cardIndex}>{String(index + 1).padStart(2, "0")}</span>
                    <div className={styles.badges}>
                      {agent.internal ? <span className={styles.internal}>Internal surface</span> : null}
                      <span className={styles.badge} data-status={meta.visual}>{meta.label}</span>
                    </div>
                  </div>

                  <div className={styles.glyph} aria-hidden="true"><i /><i /><i /></div>
                  <p className={styles.category}>{agent.category}</p>
                  <h3>{agent.name}</h3>
                  <p className={styles.description}>{agent.description}</p>

                  <div className={styles.capabilities} aria-label={`${agent.name} capabilities`}>
                    {agent.capabilities.map((capability) => <span className={styles.capability} key={capability}>{capability}</span>)}
                  </div>

                  <div className={styles.cardFooter}>
                    <div className={styles.statusNote}><span className={styles.statusDot} /><span>{meta.description}</span></div>
                    <Link className={styles.cardLink} href={agent.href ?? "/contact"}>
                      <span>{agent.href ? "View agent status" : agent.status === "coming-soon" ? "Request early access" : "Ask about this agent"}</span>
                      <span>↗</span>
                    </Link>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className={styles.empty}>No agents match those filters yet. Change the category or lifecycle to reopen the catalog.</div>
        )}
      </section>

      <section className={`${styles.section} ${styles.explain}`}>
        <div className={styles.explainLeft}>
          <p className={styles.kicker}>How the network is meant to work</p>
          <h2>Specialists outside. Orchestration underneath.</h2>
          <p>
            The goal is not to build one giant chatbot with a hundred vague promises. AMS is being structured as a network of scoped systems with clear jobs,
            shared controls, and deliberate handoffs. Customers should be able to understand what was requested, what system handled it, whether execution succeeded,
            and where human approval was required.
          </p>
        </div>
        <div className={styles.steps}>
          {operatingSteps.map(([number, title, copy]) => (
            <article className={styles.step} key={number}>
              <span>{number}</span><h3>{title}</h3><p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.cta}>
        <div className={styles.ctaInner}>
          <div>
            <h2>See the job you need automated?</h2>
            <p>
              Tell AMS which capability matters to your business. Demand does not magically make an unfinished agent Live, but it does give the roadmap a real commercial signal about what should be prioritized, tested, and productized next.
            </p>
          </div>
          <Link className={styles.ctaButton} href="/contact">Request an agent <span>↗</span></Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <Link className={styles.brand} href="/"><span className={styles.brandMark}>A</span><span className={styles.brandText}>ASPECT<span>/</span>AMS</span></Link>
        <span>Agent Network // controlled launch</span>
        <div className={styles.footerLinks}><Link href="/pricing">Pricing</Link><Link href="/contact">Contact</Link><Link href="/">Home</Link></div>
      </footer>
    </main>
  )
}
