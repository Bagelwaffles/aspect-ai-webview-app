import Link from "next/link"
import styles from "./marketing.module.css"

const outcomes = [
  {
    label: "Create",
    title: "Content without the blank page.",
    copy: "Turn one clear brief into practical copy, campaign ideas, lead magnets, emails, and social content.",
    meta: "Content Agent · Lead Magnet · SEO Writer",
  },
  {
    label: "Grow",
    title: "More attention. Better follow-up.",
    copy: "Build repeatable lead capture and nurture systems that keep opportunities moving instead of disappearing.",
    meta: "Nurture Agent · Social Publisher · Competitive Intel",
  },
  {
    label: "Publish",
    title: "Move from idea to channel faster.",
    copy: "Coordinate video, creator, social, and publishing workflows with human approval where public actions matter.",
    meta: "YouTube Publisher · Clip Generator · Stream Assistant",
  },
  {
    label: "Operate",
    title: "Less busywork behind the scenes.",
    copy: "Connect commerce, customer support, analytics, and internal workflows so your business stays organized.",
    meta: "Shopify Ops · Support · Analytics",
  },
]

const liveAgents = [
  {
    eyebrow: "01 · LIVE",
    title: "Content Agent",
    copy: "Create marketing copy, product descriptions, email drafts, and social content from one useful brief.",
    href: "/agents/content-agent",
  },
  {
    eyebrow: "02 · LIVE",
    title: "Lead Magnet Agent",
    copy: "Turn a customer problem into a focused lead magnet concept and conversion asset for your campaign.",
    href: "/agents/lead-magnet-agent",
  },
  {
    eyebrow: "03 · LIVE",
    title: "Nurture Agent",
    copy: "Create structured follow-up sequences that help qualified leads keep moving while you stay in control.",
    href: "/agents/nurture-agent",
  },
]

const steps = [
  {
    number: "01",
    title: "Choose the result",
    copy: "Start with the business outcome you want: content, leads, follow-up, search visibility, operations, or a fast audit.",
  },
  {
    number: "02",
    title: "Use the right agent",
    copy: "Every agent shows its current availability, what it does, and how to access it before you commit.",
  },
  {
    number: "03",
    title: "Review before it matters",
    copy: "Sensitive actions such as publishing, payments, or account changes keep explicit human approval.",
  },
]

function cx(...names: string[]) {
  return names.map((name) => styles[name]).filter(Boolean).join(" ")
}

export default function HomePage() {
  return (
    <main className={styles.site}>
      <div className={cx("orb", "orb-one")} aria-hidden="true" />
      <div className={cx("orb", "orb-two")} aria-hidden="true" />
      <div className={cx("orb", "orb-three")} aria-hidden="true" />

      <header className={styles.header}>
        <a className={styles.brand} href="#top" aria-label="Aspect Marketing Solutions home">
          <span className={styles.brandMark}>A</span>
          <span>
            Aspect <strong>Marketing Solutions</strong>
          </span>
        </a>

        <nav className={styles.nav} aria-label="Primary navigation">
          <Link href="/agents">Agents</Link>
          <Link href="/creators">Creators</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/quick-marketing-audit">Marketing Audit</Link>
          <Link href="/contact">Contact</Link>
        </nav>

        <Link className={styles.signIn} href="/login?next=/dashboard">
          Sign in
        </Link>
      </header>

      <section className={styles.hero} id="top">
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}>
            <span className={styles.liveDot} />
            Practical AI for growing businesses
          </div>

          <h1>
            Marketing feels easier
            <span>when the right work is automated.</span>
          </h1>

          <p className={styles.heroText}>
            Aspect Marketing Solutions gives small businesses focused AI agents for content,
            lead generation, follow-up, visibility, creator workflows, and day-to-day operations —
            with human control where it matters.
          </p>

          <div className={styles.heroActions}>
            <Link className={styles.primaryButton} href="/agents#catalog">
              Explore AI agents <span aria-hidden="true">→</span>
            </Link>
            <Link className={styles.secondaryButton} href="/quick-marketing-audit">
              Get the $49 audit
            </Link>
          </div>

          <div className={styles.heroProof} aria-label="Current AMS availability">
            <div>
              <strong>7</strong>
              <span>Live agents</span>
            </div>
            <div>
              <strong>33</strong>
              <span>Agents in catalog</span>
            </div>
            <div>
              <strong>$29</strong>
              <span>Plans from / month</span>
            </div>
            <div>
              <strong>$49</strong>
              <span>One-time audit</span>
            </div>
          </div>
        </div>

        <div className={styles.productStage} aria-label="AMS product preview">
          <div className={styles.glowFrame}>
            <div className={styles.workspace}>
              <div className={styles.workspaceHeader}>
                <div>
                  <span className={styles.microLabel}>AMS WORKSPACE</span>
                  <h2>Your marketing command center</h2>
                </div>
                <span className={styles.onlinePill}>Live</span>
              </div>

              <div className={styles.workflowCard}>
                <div className={styles.workflowTop}>
                  <span>Today&apos;s workflow</span>
                  <span>Human-controlled</span>
                </div>
                <h3>Launch a focused small-business campaign</h3>
                <div className={styles.flowLine}>
                  <span className={styles.flowActive}>Brief</span>
                  <i />
                  <span className={styles.flowActive}>Create</span>
                  <i />
                  <span>Review</span>
                  <i />
                  <span>Publish</span>
                </div>
              </div>

              <div className={styles.previewGrid}>
                <article>
                  <span className={styles.iconBubble}>✦</span>
                  <div>
                    <small>Content Agent</small>
                    <strong>Ready to create</strong>
                  </div>
                  <b>LIVE</b>
                </article>
                <article>
                  <span className={styles.iconBubble}>↗</span>
                  <div>
                    <small>Lead Magnet</small>
                    <strong>Build conversion asset</strong>
                  </div>
                  <b>LIVE</b>
                </article>
                <article>
                  <span className={styles.iconBubble}>◎</span>
                  <div>
                    <small>Nurture Agent</small>
                    <strong>Plan follow-up</strong>
                  </div>
                  <b>LIVE</b>
                </article>
              </div>

              <div className={styles.insightStrip}>
                <div>
                  <small>Clear pricing</small>
                  <strong>No mystery checkout</strong>
                </div>
                <div>
                  <small>Clear status</small>
                  <strong>Know what&apos;s actually live</strong>
                </div>
              </div>
            </div>
          </div>
          <p className={styles.previewNote}>Product-style preview — not a customer account screenshot.</p>
        </div>
      </section>

      <section className={styles.trustBar} aria-label="AMS principles">
        <span>Small-business focused</span>
        <span>Human approval built in</span>
        <span>Production-verified agents</span>
        <span>Clear pricing</span>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>Built around real business jobs</p>
            <h2>Pick the outcome. AMS handles the heavy lifting.</h2>
          </div>
          <p>
            Instead of forcing you to learn a giant AI system, AMS organizes automation around
            the work small businesses already need to get done.
          </p>
        </div>

        <div className={styles.outcomeGrid}>
          {outcomes.map((item, index) => (
            <article className={styles.outcomeCard} key={item.label}>
              <div className={styles.cardNumber}>0{index + 1}</div>
              <p className={styles.cardLabel}>{item.label}</p>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
              <small>{item.meta}</small>
            </article>
          ))}
        </div>
      </section>

      <section className={cx("section", "agentSection")}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>Available now</p>
            <h2>Start with agents already working in production.</h2>
          </div>
          <p>
            These are three of the seven live agents included in AMS plans. The full Agent Store
            shows all 33 agents and their current status.
          </p>
        </div>

        <div className={styles.agentGrid}>
          {liveAgents.map((agent) => (
            <article className={styles.agentCard} key={agent.title}>
              <div className={styles.agentCardTop}>
                <span>{agent.eyebrow}</span>
                <span className={styles.statusDot} />
              </div>
              <div className={styles.agentVisual} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <h3>{agent.title}</h3>
              <p>{agent.copy}</p>
              <Link href={agent.href}>
                View agent <span aria-hidden="true">→</span>
              </Link>
            </article>
          ))}
        </div>

        <div className={styles.centerAction}>
          <Link className={styles.secondaryButton} href="/agents#catalog">
            Browse all 33 agents
          </Link>
        </div>
      </section>

      <section className={cx("section", "experienceSection")} id="how-it-works">
        <div className={styles.experienceIntro}>
          <p className={styles.kicker}>How it works</p>
          <h2>Simple enough to use. Controlled enough to trust.</h2>
          <p>
            AMS is designed to make automation useful without hiding what is happening behind it.
          </p>
        </div>

        <div className={styles.steps}>
          {steps.map((step) => (
            <article key={step.number}>
              <span>{step.number}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.auditBand}>
        <div>
          <p className={styles.kicker}>Need a fast answer before a subscription?</p>
          <h2>Start with the $49 Quick Marketing Audit.</h2>
          <p>
            Get a focused review of your marketing, prioritized fixes, stronger messaging,
            and a practical 7-day action plan.
          </p>
        </div>
        <Link className={styles.auditButton} href="/quick-marketing-audit">
          Get my marketing audit <span aria-hidden="true">→</span>
        </Link>
      </section>

      <section className={styles.finalCta}>
        <div className={styles.finalGlow} aria-hidden="true" />
        <p className={styles.kicker}>Aspect Marketing Solutions</p>
        <h2>
          Less marketing chaos.
          <span>More useful momentum.</span>
        </h2>
        <p>
          Explore the agent catalog, compare plans, or start with the one-time audit.
          You choose the pace.
        </p>
        <div className={styles.heroActions}>
          <Link className={styles.primaryButton} href="/agents#catalog">
            Explore the Agent Store <span aria-hidden="true">→</span>
          </Link>
          <Link className={styles.secondaryButton} href="/pricing#plans">
            View pricing
          </Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>A</span>
          <span>
            Aspect <strong>Marketing Solutions</strong>
          </span>
        </div>
        <nav aria-label="Footer navigation">
          <Link href="/agents">Agents</Link>
          <Link href="/creators">Creators</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/quick-marketing-audit">$49 Audit</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        <p>© 2026 Aspect Marketing Solutions</p>
      </footer>
    </main>
  )
}
