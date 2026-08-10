"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import styles from "./agents.module.css"

import { agents, agentStatusCounts, statusMeta, type AgentStatus } from "./agentCatalog"

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

const statusOptions = ["All", "live", "beta", "setup-required", "planned", "blocked"] as const

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

  const counts = agentStatusCounts

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
              <a className={styles.primary} href="#catalog">Explore 33 agents <span>↓</span></a>
              <Link className={styles.secondary} href="/contact">Request early access <span>↗</span></Link>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.signal} aria-label="Current lifecycle counts">
        <div className={styles.signalItem} data-status="live"><span className={styles.signalLabel}>Live // verified</span><strong className={styles.signalValue}>{counts.live}</strong></div>
        <div className={styles.signalItem} data-status="beta"><span className={styles.signalLabel}>Beta // controlled</span><strong className={styles.signalValue}>{counts.beta}</strong></div>
        <div className={styles.signalItem} data-status="development"><span className={styles.signalLabel}>Setup required</span><strong className={styles.signalValue}>{counts["setup-required"]}</strong></div>
        <div className={styles.signalItem} data-status="soon"><span className={styles.signalLabel}>Planned</span><strong className={styles.signalValue}>{counts.planned}</strong></div>
        <div className={styles.signalItem} data-status="blocked"><span className={styles.signalLabel}>Blocked</span><strong className={styles.signalValue}>{counts.blocked}</strong></div>
      </section>

      <section className={styles.section} id="lifecycle">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.kicker}>Availability means something here</p>
            <h2>Roadmap labels with teeth.</h2>
          </div>
          <p>
            The agent count is an inventory of product concepts and active builds—not a claim that 33 autonomous products are running in production.
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
                    <Link className={styles.cardLink} href={`/agents/${agent.slug}`}>
                      <span>View agent status</span>
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
