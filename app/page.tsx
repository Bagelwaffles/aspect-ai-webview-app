import styles from "./marketing.module.css"

const agentCards = [
  {
    number: "01",
    status: "Launch focus",
    title: "Content Agent",
    copy: "Turn one clear brief into channel-ready marketing content with structured outputs, saved runs, and honest execution status.",
    accent: "lime",
  },
  {
    number: "02",
    status: "Queued next",
    title: "Lead Magnet Agent",
    copy: "Build a useful offer, positioning angle, and conversion path around a specific audience problem.",
    accent: "violet",
  },
  {
    number: "03",
    status: "Queued next",
    title: "Nurture Agent",
    copy: "Shape follow-up sequences that keep leads moving without sounding automated or generic.",
    accent: "orange",
  },
]

const principles = [
  ["One real agent first", "We finish the paid Content Agent flow before expanding the catalog."],
  ["Proof over theater", "No fake revenue, mock activity, or placeholder success responses."],
  [
    "Built to compound",
    "Every completed agent connects to one customer account, credit system, and saved-run history.",
  ],
]

const capabilities = [
  ["01", "Brand strategy", "Positioning, offers, and campaign direction built around a real customer problem."],
  ["02", "Content systems", "Channel-ready copy, campaigns, and reusable content engines that keep the brand moving."],
  ["03", "Search + discovery", "SEO planning, market research, and competitive intelligence that uncover demand."],
  ["04", "Social growth", "Structured publishing workflows for social, video, and community channels."],
  ["05", "Lead nurture", "Email and follow-up systems designed to turn attention into qualified conversations."],
  ["06", "Commerce operations", "Shopify-focused product, fulfillment, and customer workflows built for clean handoffs."],
  ["07", "Performance insight", "Clear reporting that shows what worked, what failed, and what to do next."],
]

const roadmapGroups = [
  {
    label: "Create",
    agents: ["Content Agent", "SEO Writer", "Email Campaign", "Lead Magnet"],
  },
  {
    label: "Grow",
    agents: ["Nurture Agent", "Social Publisher", "Affiliate Manager", "Competitive Intel"],
  },
  {
    label: "Publish",
    agents: ["YouTube Publisher", "Video Editor", "Clip Generator", "Stream Assistant"],
  },
  {
    label: "Operate",
    agents: ["Shopify Operations", "CRM Follow-up", "Customer Support", "Analytics Agent"],
  },
]

function classes(...names: string[]) {
  return names.map((name) => styles[name]).filter(Boolean).join(" ")
}

export default function HomePage() {
  return (
    <main className={styles.marketingSite}>
      <div className={classes("ambient", "ambient-one")} aria-hidden="true" />
      <div className={classes("ambient", "ambient-two")} aria-hidden="true" />

      <header className={styles["site-header"]}>
        <a className={styles.brand} href="#top" aria-label="Aspect Marketing Solutions home">
          <span className={styles["brand-mark"]}>A</span>
          <span className={styles["brand-name"]}>
            ASPECT<span>/</span>AMS
          </span>
        </a>

        <nav className={styles["desktop-nav"]} aria-label="Primary navigation">
          <a href="#capabilities">Capabilities</a>
          <a href="#agents">Agents</a>
          <a href="#method">How it works</a>
          <a href="#launch">Launch plan</a>
        </nav>

        <a className={styles["header-cta"]} href="#launch">
          Enter the system <span aria-hidden="true">↗</span>
        </a>
      </header>

      <section className={styles.hero} id="top">
        <div className={classes("eyebrow", "reveal-one")}>
          <span className={styles.pulse} />
          SaaS platform // controlled launch
        </div>

        <h1 className={styles["reveal-two"]}>
          Build demand.
          <br />
          Automate the work.
          <br />
          <span>Own the growth.</span>
        </h1>

        <div className={classes("hero-bottom", "reveal-three")}>
          <p>
            Aspect Marketing Solutions turns focused AI agents into an operating system for
            small-business growth—content first, then the full revenue machine.
          </p>
          <div className={styles["hero-actions"]}>
            <a className={classes("button", "button-primary")} href="#agents">
              Explore the agents <span aria-hidden="true">↓</span>
            </a>
            <a className={styles["text-link"]} href="#method">
              See how we build <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>

        <div className={styles["hero-stamp"]} aria-hidden="true">
          <span>AMS</span>
          <small>EST. 2026</small>
        </div>
      </section>

      <section className={styles["signal-bar"]} aria-label="Platform principles">
        <span>BUILDING REAL EXECUTION</span>
        <i>✦</i>
        <span>HONEST METRICS</span>
        <i>✦</i>
        <span>TENANT-SAFE</span>
        <i>✦</i>
        <span>BUILT TO SELL</span>
      </section>

      <section className={classes("section", "capabilities-section")} id="capabilities">
        <div className={styles["capabilities-heading"]}>
          <p className={styles["section-kicker"]}>What AMS is built to deliver</p>
          <h2>
            Strategy outside.
            <br />
            Automation inside.
          </h2>
          <p>
            The recovered AMS materials contained a strong service blueprint. We kept the useful
            business capabilities and rebuilt the presentation around the product we are actually
            launching.
          </p>
        </div>

        <div className={styles["capability-grid"]}>
          {capabilities.map(([number, title, copy]) => (
            <article className={styles.capability} key={title}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={classes("section", "agents-section")} id="agents">
        <div className={styles["section-intro"]}>
          <p className={styles["section-kicker"]}>The first strike team</p>
          <h2>
            Agents with a job.
            <br />
            Not a gimmick.
          </h2>
          <p className={styles["section-copy"]}>
            We are launching in a deliberate order: one paid workflow that works end to end,
            followed by the agents that multiply its value.
          </p>
        </div>

        <div className={styles["agent-grid"]}>
          {agentCards.map((agent) => (
            <article className={classes("agent-card", agent.accent)} key={agent.title}>
              <div className={styles["card-topline"]}>
                <span>{agent.number}</span>
                <span className={styles["status-pill"]}>{agent.status}</span>
              </div>
              <div className={styles["agent-glyph"]} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <h3>{agent.title}</h3>
              <p>{agent.copy}</p>
              <a href="#launch" aria-label={`View the ${agent.title} launch plan`}>
                View launch plan <span aria-hidden="true">↗</span>
              </a>
            </article>
          ))}
        </div>

        <div className={styles["roadmap-panel"]}>
          <div className={styles["roadmap-proof"]}>
            <p className={styles["section-kicker"]}>Recovered agent inventory</p>
            <strong>32</strong>
            <p>
              Historical agent concepts were audited. They are a backlog—not a claim that 32
              products are already live.
            </p>
          </div>

          <div className={styles["roadmap-content"]}>
            <div className={styles["roadmap-header"]}>
              <div>
                <span>Product roadmap</span>
                <h3>The strongest concepts, organized to ship.</h3>
              </div>
              <span className={styles["status-pill"]}>Planned // not live</span>
            </div>

            <div className={styles["roadmap-grid"]}>
              {roadmapGroups.map((group) => (
                <article key={group.label}>
                  <h4>{group.label}</h4>
                  <ul>
                    {group.agents.map((agent) => (
                      <li key={agent}>{agent}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={classes("section", "method-section")} id="method">
        <div className={styles["method-label"]}>
          <p className={styles["section-kicker"]}>Our operating rule</p>
          <span>03 / principles</span>
        </div>
        <div className={styles["principle-list"]}>
          {principles.map(([title, copy], index) => (
            <article className={styles.principle} key={title}>
              <span className={styles["principle-number"]}>0{index + 1}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={classes("section", "launch-section")} id="launch">
        <div className={styles["launch-copy"]}>
          <p className={styles["section-kicker"]}>Current mission</p>
          <h2>
            From recovered code
            <br />
            to paid product.
          </h2>
          <p>
            AMS is being rebuilt in controlled milestones. The public experience grows as
            authentication, subscriptions, credits, and real agent execution pass verification.
          </p>
        </div>

        <ol className={styles["launch-track"]}>
          <li className={styles.active}>
            <span>01</span>
            <div>
              <strong>Public SaaS foundation</strong>
              <small>Integrated checkpoint</small>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>Secure paid Content Agent</strong>
              <small>Staging verification next</small>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>Agent expansion + Android</strong>
              <small>After the core flow passes</small>
            </div>
          </li>
        </ol>
      </section>

      <section className={styles.closing}>
        <p>THE SYSTEM IS COMING ONLINE.</p>
        <h2>
          Build once.
          <br />
          <span>Compound forever.</span>
        </h2>
        <a className={classes("button", "button-primary")} href="#top">
          Back to command <span aria-hidden="true">↑</span>
        </a>
      </section>

      <footer className={styles.footer}>
        <a className={styles.brand} href="#top" aria-label="Aspect Marketing Solutions home">
          <span className={styles["brand-mark"]}>A</span>
          <span className={styles["brand-name"]}>
            ASPECT<span>/</span>AMS
          </span>
        </a>
        <p>Aspect Marketing Solutions © 2026</p>
        <p>Kentucky built. Global ambition.</p>
      </footer>
    </main>
  )
}
