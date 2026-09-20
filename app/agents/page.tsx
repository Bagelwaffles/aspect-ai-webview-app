"use client"

import Link from "next/link"
import { AmsPublicHeader } from "@/components/ams-public-header"
import { AmsPublicFooter } from "@/components/ams-public-footer"
import { useMemo, useState } from "react"

import styles from "./agents.module.css"

import { agents, agentStatusCounts, statusMeta, type AgentStatus } from "./agentCatalog"
import { getAgentSalesOffer } from "./agentSales"

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
  ["01", "Choose the business job", "Start with the outcome you need: content, lead generation support, email sequences, SEO, product packaging, analytics, or another scoped workflow."],
  ["02", "Check availability before buying", "Live agents can be purchased through the existing AMS subscription. The $49 Marketing Audit uses its existing one-time checkout. Beta and roadmap agents are clearly labeled and are not sold as finished products."],
  ["03", "Keep humans in control", "Sensitive actions, publishing, credentials, payments, and privileged system changes stay behind explicit authorization and verification boundaries."],
  ["04", "Expand as agents graduate", "AMS can add newly verified agents to the commercial catalog only after their production path, controls, and customer experience are proven."],
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
    <main className={`${styles.network} ams-public-page`}>
      <AmsPublicHeader />
      

      <section className={styles.hero}>
        <p className={styles.kicker}><span className={styles.kickerDot} />Aspect Agent Store // buy what is verified</p>
        <div className={styles.heroGrid}>
          <h1>Shop the agent network.<span>Put AI to work.</span></h1>
          <div className={styles.heroCopy}>
            <p>
              Browse the complete AMS catalog, open a dedicated sales page for every agent, and buy the capabilities that are actually available today.
              Seven verified Live agents are included in AMS subscriptions starting at $29/month. The Quick Marketing Audit remains a separate $49 one-time service.
              Everything else stays visible as Beta, Setup Required, Planned, or Blocked so you can see what is coming without being sold vaporware.
            </p>
            <div className={styles.heroActions}>
              <a className={styles.primary} href="#catalog">Browse all agents <span>↓</span></a>
              <Link className={styles.secondary} href="/pricing#plans">Get 7 Live agents from $29/mo <span>↗</span></Link>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.signal} aria-label="Current lifecycle counts">
        <div className={styles.signalItem} data-status="live"><span className={styles.signalLabel}>Live // buy now</span><strong className={styles.signalValue}>{counts.live}</strong></div>
        <div className={styles.signalItem} data-status="beta"><span className={styles.signalLabel}>Beta // controlled</span><strong className={styles.signalValue}>{counts.beta}</strong></div>
        <div className={styles.signalItem} data-status="development"><span className={styles.signalLabel}>Setup required</span><strong className={styles.signalValue}>{counts["setup-required"]}</strong></div>
        <div className={styles.signalItem} data-status="soon"><span className={styles.signalLabel}>Planned</span><strong className={styles.signalValue}>{counts.planned}</strong></div>
        <div className={styles.signalItem} data-status="blocked"><span className={styles.signalLabel}>Blocked</span><strong className={styles.signalValue}>{counts.blocked}</strong></div>
      </section>

      <section className={`${styles.section} ${styles.catalogSection}`} id="catalog">
        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <p>Shop by business function</p>
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
            <p>Filter by availability</p>
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
            <p className={styles.kicker}>Sales catalog</p>
            <h2>{filteredAgents.length} agents in view.</h2>
          </div>
          <p>
            Every card shows the real commercial state. “Available now” routes to an existing purchase path. Beta and roadmap agents stay visible for comparison,
            but AMS does not attach a fake price or checkout button to unfinished functionality.
          </p>
        </div>

        {filteredAgents.length ? (
          <div className={styles.catalog}>
            {filteredAgents.map((agent, index) => {
              const meta = statusMeta[agent.status]
              const offer = getAgentSalesOffer(agent)
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

                  <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/50">{offer.label}</div>
                    <div className="mt-1 text-xl font-bold text-white">{offer.price}</div>
                    <p className="mt-2 text-sm leading-6 text-white/60">{offer.detail}</p>
                  </div>

                  <div className={styles.capabilities} aria-label={`${agent.name} capabilities`}>
                    {agent.capabilities.map((capability) => <span className={styles.capability} key={capability}>{capability}</span>)}
                  </div>

                  <div className="grid gap-2">
                    <Link className={styles.cardLink} href={`/agents/${agent.slug}`}>
                      <span>View sales page + video</span>
                      <span>↗</span>
                    </Link>
                    <Link className={styles.cardLink} href={offer.primaryHref}>
                      <span>{offer.primaryLabel}</span>
                      <span>↗</span>
                    </Link>
                  </div>

                  <div className={styles.cardFooter}>
                    <div className={styles.statusNote}><span className={styles.statusDot} /><span>{agent.statusReason}</span></div>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className={styles.empty}>No agents match those filters yet. Change the category or availability filter to reopen the catalog.</div>
        )}
      </section>

      <section className={styles.section} id="lifecycle">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.kicker}>Availability means something here</p>
            <h2>Buy the verified layer. See the roadmap behind it.</h2>
          </div>
          <p>
            The full catalog is intentionally larger than the paid catalog. AMS only promotes an agent toward Live after its real execution path,
            authentication, persistence, failure handling, operator controls, and customer experience are verified. That keeps the sales catalog aggressive without becoming misleading.
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

      <section className={`${styles.section} ${styles.explain}`}>
        <div className={styles.explainLeft}>
          <p className={styles.kicker}>How buying AMS works</p>
          <h2>One catalog. Clear purchase paths.</h2>
          <p>
            Customers should be able to discover an agent, understand what it does, watch the sales video, and know immediately whether it can be purchased today.
            AMS keeps commercial access separate from roadmap visibility so the store can grow without making claims the product cannot support.
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
            <h2>Ready to put the Live agents to work?</h2>
            <p>
              Start with the shared-credit AMS subscription and get access to the seven production-verified Live agents. The catalog will expand as additional agents earn their production status.
            </p>
          </div>
          <Link className={styles.ctaButton} href="/pricing#plans">Choose a plan <span>↗</span></Link>
        </div>
      </section>

      
          <AmsPublicFooter />
</main>
  )
}
