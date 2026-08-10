import styles from "./marketing.module.css"

const agentCards = [
  {
    number: "01",
    status: "Launch focus",
    title: "Content Agent",
    copy: "Turn one clear brief into structured marketing outputs while preserving run history, execution state, and an honest boundary between planned and verified capability.",
    accent: "lime",
  },
  {
    number: "02",
    status: "Queued next",
    title: "Lead Magnet Agent",
    copy: "Turn a defined audience problem into an offer concept, positioning angle, and conversion path that can plug into the wider AMS growth system.",
    accent: "violet",
  },
  {
    number: "03",
    status: "Queued next",
    title: "Nurture Agent",
    copy: "Shape follow-up sequences and customer-touch workflows designed to keep qualified leads moving without replacing judgment with generic automation.",
    accent: "orange",
  },
]

const principles = [
  [
    "Proof over theater",
    "A card, prompt, provider key, or workflow file does not make an agent live. AMS treats verified execution, persistence, failure handling, and customer experience as the availability boundary.",
  ],
  [
    "One system, specialized jobs",
    "Agents are organized around concrete business functions so content, lead generation, publishing, commerce, support, research, and operations can eventually work as one coordinated system.",
  ],
  [
    "Human control where it matters",
    "High-impact actions, sensitive integrations, publishing, payments, and unusual requests keep explicit approval or escalation paths instead of pretending full autonomy is always better.",
  ],
  [
    "Built to compound",
    "The long-term goal is not a pile of disconnected chatbots. Completed agents should share customer context, usage controls, integrations, saved history, and measurable outcomes.",
  ],
]

const customerJourney = [
  [
    "Define the outcome",
    "Start with the business result: more qualified leads, faster content production, cleaner operations, better follow-up, stronger reporting, or a custom automation problem.",
  ],
  [
    "Route to the right capability",
    "AMS maps the request to a specialized agent, automation, service workflow, or human-reviewed build path instead of forcing every problem through one generic AI assistant.",
  ],
  [
    "Execute with controls",
    "The system is designed around authenticated actions, tenant-safe boundaries, credits or plan limits where required, persistent run state, and explicit handling for failures and retries.",
  ],
  [
    "Review what actually happened",
    "Customers should be able to see outputs, status, history, and next actions. The command-center direction is built around real operational data rather than decorative dashboard numbers.",
  ],
]

const capabilities = [
  [
    "01",
    "Brand strategy",
    "Clarify positioning, offers, messaging, and campaign direction around a real customer problem before automation multiplies the work.",
  ],
  [
    "02",
    "Content systems",
    "Create channel-ready copy, campaign assets, reusable content engines, and structured production workflows that can move from brief to execution.",
  ],
  [
    "03",
    "Search + discovery",
    "Use SEO planning, market research, competitive intelligence, and structured research workflows to uncover demand and inform decisions.",
  ],
  [
    "04",
    "Social growth",
    "Coordinate social, video, creator, and community publishing workflows with approval gates where accounts or public distribution are involved.",
  ],
  [
    "05",
    "Lead nurture",
    "Build intake, qualification, follow-up, and nurture systems that turn attention into organized conversations instead of letting opportunities disappear in an inbox.",
  ],
  [
    "06",
    "Commerce operations",
    "Connect product, fulfillment, customer, and storefront workflows so commerce tasks can move cleanly between systems without unnecessary manual handoffs.",
  ],
  [
    "07",
    "Performance insight",
    "Bring activity, failures, outputs, and business signals into reporting that explains what happened, what needs attention, and what should happen next.",
  ],
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

const lifecycleGroups = [
  {
    label: "Live",
    agents: ["Production verified", "Customer available", "Real execution path", "Measured status"],
  },
  {
    label: "Beta",
    agents: ["Functional path exists", "Controlled testing", "Limited availability", "Still being hardened"],
  },
  {
    label: "In development",
    agents: ["Actively being built", "Not sold as complete", "Early-access interest", "Verification still required"],
  },
  {
    label: "Coming soon",
    agents: ["Approved roadmap concept", "Not yet executable", "Demand can guide priority", "No fake availability"],
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
          <a href="/agents">Agent Network</a>
          <a href="#experience">How it works</a>
          <a href="/pricing">Pricing</a>
        </nav>

        <a className={styles["header-cta"]} href="/login?next=/dashboard">
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
            Aspect Marketing Solutions is building a coordinated AI operating layer for business
            growth: specialized agents for marketing, sales, content, automation, research,
            publishing, commerce, and operations—released only as their real execution paths are
            verified.
          </p>
          <div className={styles["hero-actions"]}>
            <a className={classes("button", "button-primary")} href="/quick-marketing-audit">
              Get the $49 Marketing Audit <span aria-hidden="true">↗</span>
            </a>
            <a className={styles["text-link"]} href="/agents">
              Explore the Agent Network <span aria-hidden="true">→</span>
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
            Automation is only valuable when it is attached to a real business objective. AMS is
            designed to combine clear strategy on the customer side with structured workflows,
            specialized agents, integrations, controls, and measurable execution underneath.
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
            AMS is not presenting every idea as finished software. The homepage highlights the
            first customer-facing growth roles; the full Agent Network shows the wider catalog,
            what each agent is intended to do, and exactly where it sits in the product lifecycle.
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
              <a href="/agents" aria-label={`View ${agent.title} in the AMS Agent Network`}>
                View Agent Network <span aria-hidden="true">↗</span>
              </a>
            </article>
          ))}
        </div>

        <div className={styles["roadmap-panel"]}>
          <div className={styles["roadmap-proof"]}>
            <p className={styles["section-kicker"]}>Agent network inventory</p>
            <strong>33</strong>
            <p>
              The network includes customer-facing, creator, commerce, research, automation, and
              internal platform concepts. Inventory is not the same thing as availability: every
              agent carries an explicit lifecycle status.
            </p>
          </div>

          <div className={styles["roadmap-content"]}>
            <div className={styles["roadmap-header"]}>
              <div>
                <span>Product roadmap</span>
                <h3>A broader system, organized around business jobs instead of AI novelty.</h3>
              </div>
              <span className={styles["status-pill"]}>Lifecycle controlled</span>
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

      <section className={classes("section", "agents-section")} id="status">
        <div className={styles["section-intro"]}>
          <p className={styles["section-kicker"]}>Availability without the nonsense</p>
          <h2>
            Four statuses.
            <br />
            One clear promise.
          </h2>
          <p className={styles["section-copy"]}>
            If an agent is not ready, AMS says so. The lifecycle system makes the roadmap useful to
            customers without turning unfinished work into fake product claims.
          </p>
        </div>

        <div className={styles["roadmap-panel"]}>
          <div className={styles["roadmap-proof"]}>
            <p className={styles["section-kicker"]}>Lifecycle model</p>
            <strong>4</strong>
            <p>
              Live, Beta, In Development, and Coming Soon describe how much of the real product path
              has been proven—not how exciting the idea sounds.
            </p>
          </div>

          <div className={styles["roadmap-content"]}>
            <div className={styles["roadmap-header"]}>
              <div>
                <span>What the labels mean</span>
                <h3>Customers should know what they can use today and what they are helping shape next.</h3>
              </div>
              <span className={styles["status-pill"]}>Truth by design</span>
            </div>

            <div className={styles["roadmap-grid"]}>
              {lifecycleGroups.map((group) => (
                <article key={group.label}>
                  <h4>{group.label}</h4>
                  <ul>
                    {group.agents.map((item) => (
                      <li key={item}>{item}</li>
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
          <p className={styles["section-kicker"]}>How AMS earns trust</p>
          <span>04 / operating principles</span>
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

      <section className={classes("section", "method-section")} id="experience">
        <div className={styles["method-label"]}>
          <p className={styles["section-kicker"]}>What using AMS should feel like</p>
          <span>04 / customer flow</span>
        </div>
        <div className={styles["principle-list"]}>
          {customerJourney.map(([title, copy], index) => (
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
            From platform foundation
            <br />
            to operating system.
          </h2>
          <p>
            AMS is expanding in controlled milestones. Public marketing, service paths, account
            systems, billing, integrations, agent execution, operational visibility, and the
            Android experience are treated as parts of one product—not separate demos pretending
            to be finished.
          </p>
        </div>

        <ol className={styles["launch-track"]}>
          <li className={styles.active}>
            <span>01</span>
            <div>
              <strong>Public SaaS + service foundation</strong>
              <small>Brand, offers, access paths, billing foundations, and truthful product presentation</small>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>Verified customer agent execution</strong>
              <small>Authenticated runs, persistence, failure handling, plan controls, and real customer experience</small>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>Network expansion + Command Center</strong>
              <small>More verified agents, operational dashboards, integrations, analytics, and coordinated workflows</small>
            </div>
          </li>
          <li>
            <span>04</span>
            <div>
              <strong>Android distribution</strong>
              <small>Package, store assets, policy readiness, device verification, and Google Play release path</small>
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
        <a className={classes("button", "button-primary")} href="/quick-marketing-audit">
          Start with the $49 Audit <span aria-hidden="true">↗</span>
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
