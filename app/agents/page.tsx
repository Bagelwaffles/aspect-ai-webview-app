"use client"

import Link from "next/link"
import Image from "next/image"
import { AmsPublicHeader } from "@/components/ams-public-header"
import { AmsPublicFooter } from "@/components/ams-public-footer"
import { useMemo, useState } from "react"

import styles from "./agents.module.css"

import { agents, statusMeta, type AgentStatus } from "./agentCatalog"
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
const customerAgents = agents.filter((agent) => !agent.internal)
const publicStatus: Record<AgentStatus, string> = {
  live: "Available", beta: "Limited preview", "setup-required": "Not yet available",
  planned: "Coming soon", blocked: "Unavailable"
}
const publicDescription: Record<AgentStatus, string> = {
  live: "An established service. Check current purchase options before ordering.",
  beta: "Access is limited while we continue improving the experience.",
  "setup-required": "This service cannot be purchased yet.",
  planned: "A future service that is not yet for sale.",
  blocked: "This service is currently unavailable."
}

type CategoryFilter = (typeof categoryOptions)[number]
type StatusFilter = (typeof statusOptions)[number]

const subscriptionCheckoutLive =
  process.env.NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE?.trim().toLowerCase() === "true"

const operatingSteps = [
  ["01", "Choose the business job", "Start with the outcome you need: content, lead generation support, email sequences, SEO, product packaging, analytics, or another scoped workflow."],
  ["02", "Check availability before buying", subscriptionCheckoutLive ? "Live agents can be purchased through the existing AMS subscription. The $49 Marketing Audit uses its existing one-time checkout. Beta and roadmap agents are clearly labeled and are not sold as finished products." : "Seven agents remain production-verified Live, but subscription checkout is temporarily paused in zero-cost mode. The $49 Marketing Audit remains the active paid starting point. Beta and roadmap agents are clearly labeled and are not sold as finished products."],
  ["03", "Keep humans in control", "Sensitive actions, publishing, credentials, payments, and privileged system changes stay behind explicit authorization and verification boundaries."],
  ["04", "Expand as agents graduate", "AMS can add newly verified agents to the commercial catalog only after their production path, controls, and customer experience are proven."],
]

export default function AgentsPage() {
  const [category, setCategory] = useState<CategoryFilter>("All")
  const [status, setStatus] = useState<StatusFilter>("All")

  const filteredAgents = useMemo(
    () =>
      customerAgents.filter((agent) => {
        const categoryMatch = category === "All" || agent.category === category
        const statusMatch = status === "All" || agent.status === status
        return categoryMatch && statusMatch
      }),
    [category, status],
  )

  

  return (
    <main className={`${styles.network} ams-public-page ams-public-page--balanced`}>
      <AmsPublicHeader />
      

      <section className={styles.hero}>
        <p className={styles.kicker}><span className={styles.kickerDot} />ASPECT AGENT STORE · MARKETING GROWTH</p>
        <div className={styles.heroGrid}>
          <h1>Shop the agent network.<span>Put AI to work.</span></h1>
          <div className={styles.heroCopy}>
            <p>
              {subscriptionCheckoutLive ? (
                <>Find useful tools for content, leads, follow-up, search visibility and growth. Seven agents are included in plans starting at $29/month; the Quick Marketing Audit is $49 one time. Check each service for availability before you buy.</>
              ) : (
                <>Browse tools for content, leads, follow-up and marketing growth. New subscriptions are temporarily unavailable; you can still explore the catalog and start with the $49 Quick Marketing Audit.</>
              )}
            </p>
            <div className={styles.heroActions}>
              <a className={styles.primary} href="#catalog">Browse all agents <span>↓</span></a>
              <Link className={styles.secondary} href="/pricing#plans">{subscriptionCheckoutLive ? "See plans from $29/mo" : "Compare plans"} <span>↗</span></Link>
            </div>
          </div>
        </div>
      </section>

      <div className={styles.availabilityNotice}>
        <strong>{subscriptionCheckoutLive ? "Explore the options available today." : "New subscriptions are temporarily paused."}</strong>
        <span>Service availability is always shown before purchase.</span>
      </div>

      <section className={`${styles.section} ${styles.showcaseSection}`} aria-labelledby="live-agent-showcase-title">
        <div className={styles.showcaseCopy}>
          <div>
            <p className={styles.kicker}>{subscriptionCheckoutLive ? "AI FOR YOUR BUSINESS" : "EXPLORE THE POSSIBILITIES"}</p>
            <h2 id="live-agent-showcase-title">Meet the Live AMS team.</h2>
          </div>
          <div>
            <p>
              {subscriptionCheckoutLive ? "Content, lead magnets, email campaigns, nurture, outreach, SEO, and product creation are already included in AMS subscriptions. Explore every Live agent below or compare plans to put the full team to work." : "Explore content, lead magnets, email campaigns, follow-up, SEO and product tools. New subscriptions are temporarily unavailable."}
            </p>
            <div className={styles.heroActions}>
              <a className={styles.primary} href="#catalog">Explore the Agent Store <span>↓</span></a>
              <Link className={styles.secondary} href="/pricing#plans">{subscriptionCheckoutLive ? "Compare plans" : "View pricing"} <span>↗</span></Link>
            </div>
          </div>
        </div>
        <div className={styles.showcaseArtwork}>
          <Image
            src="/agent-assets/live-agent-showcase.webp"
            alt="The seven Live AMS agents: Content, Lead Magnet, Email Campaign, Nurture, Outreach, SEO, and Product Creator"
            fill
            sizes="(max-width: 720px) calc(100vw - 40px), (max-width: 1220px) calc(100vw - 80px), 1180px"
          />
        </div>
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
                  {option === "All" ? "All options" : publicStatus[option]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.catalogHeading}>
          <div>
            <p className={styles.kicker}>Explore the agents</p>
            <h2>{filteredAgents.length} agents in view.</h2>
          </div>
          <p>
            Choose a marketing goal and see what each agent can help with. Services that are not available are clearly marked and cannot be purchased.
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
                      
                      <span className={styles.badge} data-status={meta.visual}>{publicStatus[agent.status]}</span>
                    </div>
                  </div>

                  {agent.image ? (
                    <div className={styles.cardArtwork}>
                      <Image
                        src={agent.image.src}
                        alt={agent.image.alt}
                        fill
                        sizes="(max-width: 720px) calc(100vw - 86px), (max-width: 1050px) 42vw, 340px"
                      />
                    </div>
                  ) : (
                    <div className={styles.glyph} aria-hidden="true"><i /><i /><i /></div>
                  )}
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
          <div><p className={styles.kicker}>Clear availability</p><h2>Know what you can use before you buy.</h2></div>
          <p>We clearly distinguish what is available, what has limited access, and what is coming later.</p>
        </div>
        <div className={styles.lifecycle}>
          {(Object.keys(statusMeta) as AgentStatus[]).map((key, index) => (
            <article className={styles.lifeCard} data-status={statusMeta[key].visual} key={key}>
              <div className={styles.lifeTop}><span className={styles.lifeIndex}>0{index + 1}</span><span className={styles.lifePill}>{publicStatus[key]}</span></div>
              <h3>{publicStatus[key]}</h3><p>{publicDescription[key]}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.explain}`}>
        <div className={styles.explainLeft}>
          <p className={styles.kicker}>How buying AMS works</p>
          <h2>One catalog. Clear purchase paths.</h2>
          <p>
            See the benefits, compare options, and choose what fits your business.
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
            <h2>{subscriptionCheckoutLive ? "Ready to put the Live agents to work?" : "Seven Live agents are verified and ready for reactivation."}</h2>
            <p>
              {subscriptionCheckoutLive ? "Start with the shared-credit AMS subscription and get access to the seven production-verified Live agents. The catalog will expand as additional agents earn their production status." : "Paid AI execution is intentionally paused in zero-cost mode, so subscription checkout is closed for now. Review the verified catalog and current pricing without starting a charge."}
            </p>
          </div>
          <Link className={styles.ctaButton} href="/pricing#plans">{subscriptionCheckoutLive ? "Choose a plan" : "View pricing"} <span>↗</span></Link>
        </div>
      </section>

      
          <AmsPublicFooter />
</main>
  )
}
