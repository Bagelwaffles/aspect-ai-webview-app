import type { Metadata } from "next"
import Link from "next/link"
import { agents, agentStatusCounts, statusMeta, type AgentCategory } from "../agents/agentCatalog"
import CollaborationBriefBuilder from "./CollaborationBriefBuilder"
import styles from "./collaborate.module.css"

export const metadata: Metadata = {
  title: "Collaborate with AMS | Aspect Marketing Solutions",
  description:
    "A public collaboration hub for Aspect Marketing Solutions: company context, current agent status, pilot models, guardrails, and an AI-ready collaboration brief.",
}

const collaborationModels = [
  {
    title: "Pilot collaboration",
    copy: "Start with one small, reversible project using AMS or another owner-approved test case. Define the outcome, owners, limits, and success criteria before expanding.",
  },
  {
    title: "Co-branded service",
    copy: "Combine complementary expertise into one client offer—for example strategy on one side and automation, content systems, audit support, or workflow execution on the other.",
  },
  {
    title: "Referral relationship",
    copy: "Refer qualified work when one side is better suited to the client need. Referral terms, attribution, and customer ownership should be documented before money changes hands.",
  },
  {
    title: "Technology / integration",
    copy: "Connect an owner-authorized tool, workflow, dataset, or service to AMS when there is a real business use case and a safe least-privilege integration path.",
  },
  {
    title: "Content + distribution",
    copy: "Pair domain expertise, audience access, or creative strategy with AMS content, video, workflow, or publishing infrastructure—keeping public actions approval-first.",
  },
  {
    title: "Research + product development",
    copy: "Use a collaborator's niche expertise to help prioritize, test, evaluate, or shape a planned AMS capability without presenting an experiment as a finished product.",
  },
]

const stack = [
  ["Web platform", "Next.js application deployed through Vercel with server-side routes and protected product paths."],
  ["Workflow orchestration", "n8n Cloud is part of the automation backbone for approved webhooks, integrations, fulfillment, and publishing flows."],
  ["Payments", "Stripe is used for payment and entitlement flows. Public collaboration pages never expose payment secrets or internal keys."],
  ["State + controls", "AMS architecture includes persistent run state, rate limits, idempotency, usage controls, and explicit failure handling where required."],
  ["Authentication", "Protected product paths use authenticated server-side access. Collaboration does not grant account or operator access by default."],
  ["Mobile", "An Android companion is moving through the Google Play testing/review process as a separate controlled release track."],
]

const guardrails = [
  "No passwords, API keys, payment secrets, private keys, or recovery codes are exchanged in collaboration briefs.",
  "Planned or setup-required agents are never represented to customers as live just because the concept or workflow exists.",
  "Client-facing work starts only after scope, owners, approvals, data handling, and commercial terms are clear.",
  "Public posting, payment actions, account changes, destructive operations, and unusual requests stay human-approved unless a specific safe automation is documented.",
  "A pilot should be reversible, measurable, and small enough to stop without harming a customer relationship or production system.",
  "Revenue share, referral fees, ownership, IP rights, exclusivity, and legal partnership status are separate written decisions—not assumptions created by a conversation.",
]

const pilotSteps = [
  ["01", "Define one outcome", "Choose a specific result that can be measured: qualified conversations, a finished workflow, a validated offer, a content system, an audit process, or another concrete business result."],
  ["02", "Assign ownership", "Write down what the collaborator owns, what AMS owns, what requires joint approval, and what is explicitly out of scope."],
  ["03", "Run a safe pilot", "Use owner-authorized accounts, test data, or AMS itself where possible. Keep the pilot reversible and avoid unnecessary access."],
  ["04", "Review before scaling", "Compare results to the agreed success metrics. Then decide whether to stop, revise, repeat, productize, refer work, or create commercial terms."],
]

const responsibilities = [
  {
    label: "AMS can bring",
    items: [
      "AI-assisted content and marketing workflow design",
      "Structured marketing audit and growth-planning capability",
      "Automation architecture and n8n workflow support",
      "Agent-oriented product and SaaS infrastructure",
      "Publishing, creator, commerce, research, and operations roadmap",
      "Payment / entitlement architecture for approved offers",
      "A controlled test environment and pilot-first operating model",
    ],
  },
  {
    label: "A collaborator can bring",
    items: [
      "Specialized domain expertise or a proven service",
      "Audience, distribution, sales channel, or community access",
      "Client insight and clearly defined customer problems",
      "Technology, data, workflows, or integrations they are authorized to use",
      "Delivery capacity, strategy, creative expertise, or implementation support",
      "Evidence of what already works in their niche",
      "A clear view of what they want AMS to own versus what they will own",
    ],
  },
  {
    label: "We decide together",
    items: [
      "Pilot scope and success criteria",
      "Branding and customer-facing claims",
      "Who owns each customer relationship and deliverable",
      "What data or systems are needed and why",
      "Pricing, referral fees, revenue share, or fixed-fee structure",
      "Intellectual property and reuse rights",
      "Whether the pilot should become a repeatable offer",
    ],
  },
]

const commercialFacts = [
  ["Public entry offer", "Quick Marketing Audit — $49 one-time, no subscription, with a 48-hour delivery target."],
  ["Collaboration pricing", "Not standardized. Pilot scope and verified capabilities determine whether work is fixed-fee, referral-based, co-branded, or another mutually agreed model."],
  ["Partnership status", "A collaboration discussion does not create a legal partnership, joint venture, employment relationship, exclusivity, or equity commitment."],
  ["Customer promises", "Only capabilities with an honest current status should be included in a client promise. Planned capabilities can be discussed as roadmap opportunities, not guaranteed delivery."],
]

const categories: AgentCategory[] = [
  "Marketing",
  "Sales",
  "Automation",
  "Content",
  "Commerce",
  "Operations",
  "Research",
  "Creator",
  "Platform",
]

function statusClass(status: string) {
  return `${styles.status} ${styles[`status-${status}`] ?? ""}`
}

export default function CollaboratePage() {
  const aiContext = [
    "COMPANY: Aspect Marketing Solutions (AMS).",
    "WEBSITE: https://www.aspectmarketingsolutions.app/",
    "POSITIONING: AMS is building a coordinated AI operating layer for business growth using specialized agents, automation, controlled integrations, and human approval where higher-impact actions require it.",
    "PUBLIC OFFER: Quick Marketing Audit — $49 one-time, no subscription, target delivery within 48 hours.",
    `AGENT INVENTORY: ${agents.length} cataloged agents. Current counts — Live ${agentStatusCounts.live}; Beta ${agentStatusCounts.beta}; Setup Required ${agentStatusCounts["setup-required"]}; Planned ${agentStatusCounts.planned}; Blocked ${agentStatusCounts.blocked}.`,
    "STATUS RULE: inventory is not availability. Live requires verified production proof; Beta is controlled testing; Setup Required means the build exists but an integration/credential/workflow/fresh proof is still required; Planned is roadmap only; Blocked has a named dependency.",
    "ARCHITECTURE: Next.js/Vercel web platform, server-side protected routes, Stripe payment/entitlement flows, n8n Cloud orchestration, persistent state/usage/failure controls, authenticated access, and a separate Android release track.",
    "COLLABORATION PRINCIPLE: start with one reversible, measurable pilot before making broad customer promises or long-term commercial commitments.",
    "SECURITY: never request or exchange passwords, API keys, secret tokens, private keys, recovery codes, or payment-card data in a collaboration brief. Use owner-authorized least-privilege integrations instead.",
    "COMMERCIAL RULE: revenue share, referral fees, IP ownership, exclusivity, equity, legal partnership status, and customer ownership require separate explicit agreement.",
    `AGENTS: ${agents.map((agent) => `${agent.name} [${statusMeta[agent.status].label}]`).join("; ")}.`,
  ].join("\n")

  return (
    <main className={styles.page}>
      <div className={styles.gridGlow} aria-hidden="true" />

      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandMark}>A</span>
          <span>ASPECT / AMS</span>
        </Link>
        <nav className={styles.nav} aria-label="Collaboration page navigation">
          <a href="#company">Company</a>
          <a href="#models">Ways to collaborate</a>
          <a href="#agents">Agent network</a>
          <a href="#brief">Build a brief</a>
        </nav>
        <a className={styles.topCta} href="mailto:kimberleyaversbiz@gmail.com?subject=AMS%20Collaboration">
          Start a conversation
        </a>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>AMS Collaboration Hub // public briefing</p>
          <h1>
            Understand the company.
            <br />
            Find the overlap.
            <br />
            <span>Test something real.</span>
          </h1>
          <p className={styles.heroLead}>
            This page is the public collaboration briefing for Aspect Marketing Solutions. It is
            designed for founders, consultants, creators, agencies, developers, AI builders, and
            service providers who want to understand AMS before proposing a collaboration.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryButton} href="#brief">
              Build a collaboration brief
            </a>
            <a className={styles.secondaryButton} href="/api/collaboration-profile" target="_blank" rel="noreferrer">
              Open AI-readable profile
            </a>
          </div>
        </div>

        <aside className={styles.heroPanel}>
          <p className={styles.microLabel}>Fast facts</p>
          <dl className={styles.factList}>
            <div><dt>Company</dt><dd>Aspect Marketing Solutions</dd></div>
            <div><dt>Model</dt><dd>SaaS + AI agents + automation + services</dd></div>
            <div><dt>Agent catalog</dt><dd>{agents.length} defined roles</dd></div>
            <div><dt>Public offer</dt><dd>$49 Quick Marketing Audit</dd></div>
            <div><dt>Operating rule</dt><dd>Proof over theater</dd></div>
            <div><dt>Collaboration rule</dt><dd>Pilot before scale</dd></div>
          </dl>
        </aside>
      </section>

      <section className={styles.signalBar} aria-label="AMS collaboration principles">
        <span>NO FAKE AVAILABILITY</span><i>✦</i><span>OWNER-AUTHORIZED ACCESS</span><i>✦</i>
        <span>PILOT FIRST</span><i>✦</i><span>MEASURE THE RESULT</span>
      </section>

      <section className={styles.section} id="company">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>01 // company context</p>
          <h2>What AMS is building</h2>
          <p>
            AMS is building a coordinated AI operating layer for business growth. The long-term
            system organizes specialized agents around concrete jobs in marketing, sales, content,
            automation, commerce, research, creator workflows, operations, and platform control.
            The product deliberately separates roadmap inventory from verified availability.
          </p>
        </div>

        <div className={styles.statGrid}>
          {Object.entries(agentStatusCounts).map(([status, count]) => (
            <article className={styles.statCard} key={status}>
              <span className={statusClass(status)}>{statusMeta[status as keyof typeof statusMeta].label}</span>
              <strong>{count}</strong>
              <p>{statusMeta[status as keyof typeof statusMeta].description}</p>
            </article>
          ))}
        </div>

        <div className={styles.twoColumn}>
          <article className={styles.panel}>
            <p className={styles.microLabel}>Operating philosophy</p>
            <h3>Proof over theater.</h3>
            <p>
              A prompt, provider key, workflow file, mockup, or catalog card does not make a
              capability live. AMS treats authenticated execution, persistence, failure handling,
              access control, and customer experience as part of the product proof.
            </p>
          </article>
          <article className={styles.panel}>
            <p className={styles.microLabel}>Why collaborate</p>
            <h3>Bring complementary strengths together.</h3>
            <p>
              The best AMS collaborations add something specific: niche expertise, an audience,
              distribution, a proven service, authorized technology, delivery capacity, or a real
              customer problem that benefits from structured automation and AI support.
            </p>
          </article>
        </div>
      </section>

      <section className={styles.section} id="models">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>02 // collaboration models</p>
          <h2>Six useful ways to work together</h2>
          <p>
            These are starting models, not fixed contracts. A real collaboration should choose the
            simplest structure that matches the problem and keeps responsibilities obvious.
          </p>
        </div>
        <div className={styles.cardGrid}>
          {collaborationModels.map((model, index) => (
            <article className={styles.numberCard} key={model.title}>
              <span>0{index + 1}</span>
              <h3>{model.title}</h3>
              <p>{model.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>03 // pilot operating model</p>
          <h2>Do not start with a giant partnership.</h2>
          <p>
            Start with one project that can prove whether the relationship, workflow, and customer
            value are real. This reduces risk for both sides and gives any future agreement evidence
            instead of assumptions.
          </p>
        </div>
        <div className={styles.timeline}>
          {pilotSteps.map(([number, title, copy]) => (
            <article key={number}>
              <span>{number}</span>
              <div><h3>{title}</h3><p>{copy}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>04 // responsibilities</p>
          <h2>Know who owns what.</h2>
        </div>
        <div className={styles.responsibilityGrid}>
          {responsibilities.map((group) => (
            <article className={styles.panel} key={group.label}>
              <h3>{group.label}</h3>
              <ul>{group.items.map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>05 // technical context</p>
          <h2>Enough architecture to plan responsibly.</h2>
          <p>
            This is intentionally high-level. A collaborator should understand the system boundary
            without receiving internal credentials, secret values, private admin paths, or customer
            data.
          </p>
        </div>
        <div className={styles.stackGrid}>
          {stack.map(([title, copy]) => (
            <article key={title}><h3>{title}</h3><p>{copy}</p></article>
          ))}
        </div>
      </section>

      <section className={styles.section} id="agents">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>06 // current agent network</p>
          <h2>All {agents.length} roles, with honest status.</h2>
          <p>
            This inventory is useful for finding collaboration opportunities. It is not a promise
            that every listed agent can serve a customer today.
          </p>
        </div>

        <div className={styles.agentGroups}>
          {categories.map((category) => {
            const categoryAgents = agents.filter((agent) => agent.category === category)
            if (!categoryAgents.length) return null
            return (
              <section className={styles.agentGroup} key={category}>
                <div className={styles.agentGroupHeading}>
                  <h3>{category}</h3><span>{categoryAgents.length} roles</span>
                </div>
                <div className={styles.agentList}>
                  {categoryAgents.map((agent) => (
                    <article className={styles.agentRow} key={agent.slug}>
                      <div>
                        <h4>{agent.name}</h4>
                        <p>{agent.description}</p>
                      </div>
                      <span className={statusClass(agent.status)}>{statusMeta[agent.status].label}</span>
                    </article>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>07 // commercial context</p>
          <h2>What a conversation does—and does not—mean.</h2>
        </div>
        <div className={styles.factTable}>
          {commercialFacts.map(([label, value]) => (
            <div key={label}><strong>{label}</strong><p>{value}</p></div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>08 // collaboration guardrails</p>
          <h2>Protect both sides before moving fast.</h2>
        </div>
        <div className={styles.guardrailList}>
          {guardrails.map((guardrail, index) => (
            <article key={guardrail}><span>{String(index + 1).padStart(2, "0")}</span><p>{guardrail}</p></article>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.briefSection}`} id="brief">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>09 // collaboration intake</p>
          <h2>Build a brief a human—or an AI—can actually use.</h2>
          <p>
            Fill this out directly, or copy the AI interview prompt and let your preferred assistant
            interview you. The output is an exploratory planning document, not a contract.
          </p>
        </div>
        <CollaborationBriefBuilder aiContext={aiContext} />
      </section>

      <section className={styles.aiEndpoint}>
        <div>
          <p className={styles.eyebrow}>For AI systems and technical collaborators</p>
          <h2>Structured public context is available as JSON.</h2>
          <p>
            Use the endpoint below to retrieve the current public company profile, collaboration
            models, guardrails, status definitions, and agent catalog without scraping this page.
          </p>
        </div>
        <code>GET /api/collaboration-profile</code>
      </section>

      <footer className={styles.footer}>
        <div>
          <strong>ASPECT MARKETING SOLUTIONS</strong>
          <p>Build something useful. Prove it. Then decide what comes next.</p>
        </div>
        <div className={styles.footerLinks}>
          <Link href="/">Home</Link>
          <Link href="/agents">Agent Network</Link>
          <Link href="/quick-marketing-audit">Quick Marketing Audit</Link>
          <a href="mailto:kimberleyaversbiz@gmail.com?subject=AMS%20Collaboration">Email AMS</a>
        </div>
      </footer>
    </main>
  )
}
