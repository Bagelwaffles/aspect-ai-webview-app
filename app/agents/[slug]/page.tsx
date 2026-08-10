import Link from "next/link"
import { notFound } from "next/navigation"

import { agents, getAgent, statusMeta } from "../agentCatalog"
import styles from "../agents.module.css"

export function generateStaticParams() {
  return agents.map((agent) => ({ slug: agent.slug }))
}

export default async function AgentStatusPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const agent = getAgent(slug)
  if (!agent) notFound()

  const meta = statusMeta[agent.status]

  return (
    <main className={styles.network}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/"><span className={styles.brandMark}>A</span><span className={styles.brandText}>ASPECT<span>/</span>AMS</span></Link>
        <nav className={styles.nav}><Link href="/agents">All agents</Link><Link href="/pricing">Pricing</Link><Link href="/contact">Contact</Link></nav>
        <Link className={styles.enter} href="/agents">Agent network ↗</Link>
      </header>

      <section className={styles.hero}>
        <p className={styles.kicker}><span className={styles.kickerDot} />{agent.category} {"//"} current status</p>
        <div className={styles.heroGrid}>
          <h1>{agent.name}<span>{meta.label}</span></h1>
          <div className={styles.heroCopy}>
            <p>{agent.description}</p>
            <div className={styles.heroActions}>
              {agent.launchHref ? <Link className={styles.primary} href={agent.launchHref}>Open beta <span>↗</span></Link> : null}
              <Link className={styles.secondary} href="/contact">Request access <span>↗</span></Link>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div><p className={styles.kicker}>Launch truth</p><h2>{meta.label}</h2></div>
          <p>{meta.description}</p>
        </div>
        <div className={styles.catalog}>
          <article className={styles.card} data-status={meta.visual}>
            <p className={styles.category}>Why this status</p>
            <h3>Current evidence</h3>
            <p className={styles.description}>{agent.statusReason}</p>
          </article>
          <article className={styles.card} data-status={meta.visual}>
            <p className={styles.category}>Next activation gate</p>
            <h3>What moves it forward</h3>
            <p className={styles.description}>{agent.nextMilestone}</p>
          </article>
          <article className={styles.card} data-status={meta.visual}>
            <p className={styles.category}>Capability surface</p>
            <h3>Designed to handle</h3>
            <div className={styles.capabilities}>{agent.capabilities.map((capability) => <span className={styles.capability} key={capability}>{capability}</span>)}</div>
          </article>
        </div>
      </section>

      <section className={styles.cta}><div className={styles.ctaInner}><div><h2>Bring this agent online.</h2><p>AMS promotes agents one at a time only after the named activation gate passes in production.</p></div><Link className={styles.ctaButton} href="/contact">Prioritize this agent <span>↗</span></Link></div></section>
    </main>
  )
}
