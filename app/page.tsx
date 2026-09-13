import Link from "next/link"
import styles from "./marketing.module.css"

const quickStarts = [
  {
    label: "Browse AI agents",
    copy: "Compare all 33 agents by availability, business job, and purchase path. Seven Live agents are included in AMS plans from $29/month.",
    href: "/agents#catalog",
    cta: "Open the Agent Store",
  },
  {
    label: "Need a fast marketing diagnosis?",
    copy: "Get the $49 Quick Marketing Audit for a focused review, prioritized fixes, stronger messaging, and a practical 7-day action plan.",
    href: "/quick-marketing-audit",
    cta: "Get the $49 Audit",
  },
  {
    label: "Already an AMS customer?",
    copy: "Sign in to your dashboard to use the agents and services available with your account.",
    href: "/login?next=/dashboard",
    cta: "Sign in",
  },
]

const agentCards = [
  {
    number: "01",
    status: "Live",
    title: "Content Agent",
    copy: "Create practical marketing copy, product descriptions, email drafts, and social content from one clear brief.",
    accent: "lime",
    href: "/agents/content-agent",
  },
  {
    number: "02",
    status: "Live",
    title: "Lead Magnet Agent",
    copy: "Turn a customer problem into a focused lead magnet concept and conversion asset for your campaign.",
    accent: "violet",
    href: "/agents/lead-magnet-agent",
  },
  {
    number: "03",
    status: "Live",
    title: "Nurture Agent",
    copy: "Create structured follow-up sequences that help keep qualified leads moving while preserving human review.",
    accent: "orange",
    href: "/agents/nurture-agent",
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
    "Choose the outcome",
    "Start with what you need: more leads, faster content, stronger follow-up, better SEO, cleaner operations, useful analytics, or a focused marketing audit.",
  ],
  [
    "Pick the right agent or service",
    "The Agent Store shows exactly what each agent does, whether it is available now, and where to buy or open it.",
  ],
  [
    "Use it with clear controls",
    "Available agents run through authenticated customer workflows with plan limits, saved history, and explicit handling for failures and retries.",
  ],
  [
    "Review the result",
    "You stay in control of the final output and any sensitive action such as publishing, payments, account changes, or external delivery.",
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
    label: "Setup Required",
    agents: ["Core build exists", "Configuration still required", "Fails closed until connected", "Not sold as complete"],
  },
  {
    label: "Blocked",
    agents: ["Named dependency or owner action", "No fake execution", "Blocker is published", "Work resumes when cleared"],
  },
  {
    label: "Planned",
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
          <Link href="/agents">Agent Store</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/quick-marketing-audit">$49 Audit</Link>
          <a href="#experience">How it works</a>
          <Link href="/contact">Contact</Link>
        </nav>

        <a className={styles["header-cta"]} href="/login?next=/dashboard">
          Sign in <span aria-hidden="true">↗</span>
        </a>
      </header>

      <section className={styles.hero} id="top">
        <div className={classes("eyebrow", "reveal-one")}>
          <span className={styles.pulse} />
          AI marketing agents for small businesses
        </div>

        <h1 className={styles["reveal-two"]}>
          Find the right agent.
          <br />
          Put it to work.
          <br />
          <span>Grow with clarity.</span>
        </h1>

        <div className={classes("hero-bottom", "reveal-three")}>
          <p>
            Start with seven production-verified AI agents included in AMS plans from $29/month,
            or get the $49 Quick Marketing Audit. Every offer clearly shows what is available now,
            what it costs, and what happens next.
          </p>
          <div className={styles["hero-actions"]}>
            <Link className={classes("button", "button-primary")} href="/agents#catalog">
              Browse the Agent Store <span aria-hidden="true">↗</span>
            </Link>
            <Link className={styles["text-link"]} href="/pricing#plans">
              View plans from $29/month <span aria-hidden="true">→</span>
            </Link>
            <Link className={styles["text-link"]} href="/quick-marketing-audit">
              Or get the $49 Marketing Audit <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        <div className={styles["hero-stamp"]} aria-hidden="true">
          <span>AMS</span>
          <small>EST. 2026</small>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-5 pb-12 sm:px-8 lg:grid-cols-3 lg:pb-16" aria-label="Choose where to start">
        {quickStarts.map((item) => (
          <article key={item.label} className="flex min-h-60 flex-col rounded-xl border border-white/10 bg-white/[0.035] p-6 shadow-lg">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#c9ff3d]">Start here</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-white">{item.label}</h2>
            <p className="mt-3 text-sm leading-6 text-white/65">{item.copy}</p>
            <Link className="mt-auto pt-6 text-sm font-semibold text-[#c9ff3d] hover:text-white" href={item.href}>
              {item.cta} <span aria-hidden="true">→</span>
            </Link>
          </article>
        ))}
      </section>

      <section className={styles["signal-bar"]} aria-label="Current offers">
        <span>7 LIVE AGENTS</span>
        <i>✦</i>
        <span>PLANS FROM $29/MO</span>
        <i>✦</i>
        <span>$49 ONE-TIME AUDIT</span>
        <i>✦</i>
        <span>HUMAN-CONTROLLED</span>
      </section>

      <section className={classes("section", "capabilities-section")} id="capabilities">
        <div className={styles["capabilities-heading"]}>
          <p className={styles["section-kicker"]}>What AMS helps you do</p>
          <h2>
            Choose the job.
            <br />
            Use the right tool.
          </h2>
          <p>
            AMS organizes AI around practical business work: creating content, generating leads,
            improving follow-up, strengthening search visibility, supporting commerce, and making
            day-to-day operations easier to manage.
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
          <p className={styles["section-kicker"]}>Featured Live agents</p>
          <h2>
            Start with work
            <br />
            you need today.
          </h2>
          <p className={styles["section-copy"]}>
            These are three of the seven production-verified agents available through AMS plans.
            Each card opens a dedicated sales page with capabilities, pricing, availability, and a
            sales video. The full Agent Store contains all 33 agents and their current status.
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
              <Link href={agent.href} aria-label={`View ${agent.title} sales page`}>
                View sales page <span aria-hidden="true">↗</span>
              </Link>
            </article>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Link className={classes("button", "button-primary")} href="/agents#catalog">
            Browse all 33 agents <span aria-hidden="true">↗</span>
          </Link>
          <Link className={styles["text-link"]} href="/pricing#plans">
            Compare subscription plans <span aria-hidden="true">→</span>
          </Link>
        </div>

        <div className={styles["roadmap-panel"]}>
          <div className={styles["roadmap-proof"]}>
            <p className={styles["section-kicker"]}>Agent Store inventory</p>
            <strong>33</strong>
            <p>
              The store includes customer-facing, creator, commerce, research, automation, and
              platform agents. Each one is labeled Live, Beta, Setup Required, Planned, or Blocked.
            </p>
          </div>

          <div className={styles["roadmap-content"]}>
            <div className={styles["roadmap-header"]}>
              <div>
                <span>Organized by business job</span>
                <h3>Find the capability you need without guessing what the product actually does.</h3>
              </div>
              <span className={styles["status-pill"]}>Clear availability</span>
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
          <p className={styles["section-kicker"]}>Know what is ready before you buy</p>
          <h2>
            Five statuses.
            <br />
            No guesswork.
          </h2>
          <p className={styles["section-copy"]}>
            If an agent is not ready, AMS says so. Live agents can be used now. Beta and roadmap
            agents remain visible so you can understand what is available today and what is coming next.
          </p>
        </div>

        <div className={styles["roadmap-panel"]}>
          <div className={styles["roadmap-proof"]}>
            <p className={styles["section-kicker"]}>Availability model</p>
            <strong>5</strong>
            <p>
              Live, Beta, Setup Required, Blocked, and Planned tell you how ready an agent is and
              whether it can be purchased or used today.
            </p>
          </div>

          <div className={styles["roadmap-content"]}>
            <div className={styles["roadmap-header"]}>
              <div>
                <span>What the labels mean</span>
                <h3>Customers should know exactly what they can use today.</h3>
              </div>
              <span className={styles["status-pill"]}>Clear by design</span>
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
          <p className={styles["section-kicker"]}>How to use AMS</p>
          <span>04 / simple customer flow</span>
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
          <p className={styles["section-kicker"]}>Product progress</p>
          <h2>
            Available now.
            <br />
            Expanding carefully.
          </h2>
          <p>
            AMS already has production-verified customer agents and a live $49 audit. Additional
            agents are promoted only after their real customer path, controls, and reliability are verified.
          </p>
        </div>

        <ol className={styles["launch-track"]}>
          <li className={styles.active}>
            <span>01</span>
            <div>
              <strong>Public Agent Store + paid offers</strong>
              <small>Clear catalog, dedicated sales pages, subscription access, and the $49 audit</small>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>More verified customer agents</strong>
              <small>Additional business jobs move to Live after controlled production verification</small>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>Operational visibility + integrations</strong>
              <small>More analytics, connected workflows, and customer-facing management tools</small>
            </div>
          </li>
          <li>
            <span>04</span>
            <div>
              <strong>Android distribution</strong>
              <small>Final device verification, Play Console release work, store assets, and policy completion</small>
            </div>
          </li>
        </ol>
      </section>

      <section className={styles.closing}>
        <p>READY TO CHOOSE YOUR NEXT STEP?</p>
        <h2>
          Find the right agent.
          <br />
          <span>Start with confidence.</span>
        </h2>
        <div className="flex flex-wrap justify-center gap-4">
          <Link className={classes("button", "button-primary")} href="/agents#catalog">
            Browse the Agent Store <span aria-hidden="true">↗</span>
          </Link>
          <Link className={styles["text-link"]} href="/quick-marketing-audit">
            Get the $49 Audit <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <a className={styles.brand} href="#top" aria-label="Aspect Marketing Solutions home">
          <span className={styles["brand-mark"]}>A</span>
          <span className={styles["brand-name"]}>
            ASPECT<span>/</span>AMS
          </span>
        </a>
        <nav className="flex flex-wrap justify-center gap-4 text-xs text-white/60" aria-label="Footer navigation">
          <Link href="/agents">Agents</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/quick-marketing-audit">$49 Audit</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/login?next=/dashboard">Sign in</Link>
        </nav>
        <p>Aspect Marketing Solutions © 2026</p>
      </footer>
    </main>
  )
}