import Link from "next/link"
import Image from "next/image"
import { AMS_BRAND_ASSETS } from "@/lib/ams-brand-assets"
import { isContentAgentLaunchEnabled } from "@/lib/content-agent-launch"
import styles from "./marketing.module.css"

const outcomes = [
  {
    label: "Create",
    title: "Content without the blank page.",
    copy: "Turn one clear brief into practical copy, campaign ideas, lead magnets, emails, and social content.",
    meta: "Content Agent · Lead Magnet · SEO Writer",
    href: "/agents?category=Content#catalog",
  },
  {
    label: "Grow",
    title: "More attention. Better follow-up.",
    copy: "Build repeatable lead capture and nurture systems that keep opportunities moving instead of disappearing.",
    meta: "Nurture Agent · Social Publisher · Competitive Intel",
    href: "/agents?category=Marketing#catalog",
  },
  {
    label: "Publish",
    title: "Move from idea to channel faster.",
    copy: "Coordinate video, creator, social, and publishing workflows with human approval where public actions matter.",
    meta: "YouTube Publisher · Clip Generator · Stream Assistant",
    href: "/agents?category=Creator#catalog",
  },
  {
    label: "Operate",
    title: "Less busywork behind the scenes.",
    copy: "Connect commerce, customer support, analytics, and internal workflows so your business stays organized.",
    meta: "Shopify Ops · Support · Analytics",
    href: "/agents?category=Operations#catalog",
  },
]

const liveAgents = [
  {
    eyebrow: "01 · LIVE",
    title: "Content Agent",
    copy: "Draft marketing copy, product descriptions, emails, and social posts from a simple brief.",
    href: "/agents/content-agent",
  },
  {
    eyebrow: "02 · LIVE",
    title: "Lead Magnet Agent",
    copy: "Shape a useful lead magnet around the problem your customers need solved.",
    href: "/agents/lead-magnet-agent",
  },
  {
    eyebrow: "03 · LIVE",
    title: "Nurture Agent",
    copy: "Draft thoughtful follow-ups that keep conversations moving, with you in control.",
    href: "/agents/nurture-agent",
  },
]

const steps = [
  {
    number: "01",
    title: "Choose the result",
    copy: "Choose a business goal: create content, capture interest, or follow up.",
  },
  {
    number: "02",
    title: "Use the right agent",
    copy: "See what each agent does and whether it’s available before you buy.",
  },
  {
    number: "03",
    title: "Review before it matters",
    copy: "Publishing, payments, and account changes require your approval.",
  },
]

function cx(...names: string[]) {
  return names.map((name) => styles[name]).filter(Boolean).join(" ")
}

export default function HomePage() {
  const subscriptionCheckoutLive = isContentAgentLaunchEnabled()

  return (
    <main className={styles.site}>
      <div className={cx("orb", "orb-one")} aria-hidden="true" />
      <div className={cx("orb", "orb-two")} aria-hidden="true" />
      <div className={cx("orb", "orb-three")} aria-hidden="true" />

      <header className={styles.header}>
        <a className={styles.brand} href="#top" aria-label="Aspect Marketing Solutions home">
          <span className={styles.brandMark}><Image src={AMS_BRAND_ASSETS.icon} width={42} height={42} alt="" unoptimized /></span>
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

        <details className={styles.mobileMenu}>
          <summary>Menu <span aria-hidden="true">☰</span></summary>
          <nav aria-label="Mobile navigation">
            <Link href="/agents">Agent Store</Link>
            <Link href="/creators">Creator OS</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/quick-marketing-audit">Marketing Audit</Link>
            <Link href="/contact">Contact</Link>
          </nav>
        </details>

        <Link className={styles.signIn} href="/login?next=/dashboard">
          Sign in
        </Link>
      </header>

      <section className={styles.cinematicHero} id="top" aria-label="Aspect Marketing Solutions official brand">
        <div className={styles.cinematicArtwork}>
          <Image src={AMS_BRAND_ASSETS.hero} width={1536} height={864} priority unoptimized className={styles.cinematicPanorama}
            alt="ASPECT Marketing Solutions metallic logo between connected electric-blue and violet global networks" />
          <div className={styles.mobileBrandArtwork}>
            <Image src={AMS_BRAND_ASSETS.emblem} width={330} height={330} unoptimized alt="Metallic angular A logo" />
            <strong>ASPECT</strong>
            <span>MARKETING SOLUTIONS</span>
            <small>AI AGENTS · AUTOMATION · GROWTH</small>
          </div>
        </div>
        <div className={styles.cinematicCaption}>
          <div>
            <span>GLOBAL THINKING · HUMAN CONTROL</span>
            <p>AI marketing intelligence built to move your business forward.</p>
          </div>
          <Link href="/agents#catalog" className={styles.cinematicCta}>Explore AI agents <span aria-hidden="true">↗</span></Link>
        </div>
      </section>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}>
            <span className={styles.liveDot} />
            INTELLIGENT GROWTH SYSTEMS · HUMAN CONTROLLED
          </div>

          <h1>
            Your marketing. In motion.
            <span>Your decisions. In control.</span>
          </h1>

          <p className={styles.heroText}>
            {subscriptionCheckoutLive ? (
              <>
                One connected place for content, leads, follow-up, visibility, and smarter marketing workflows.
                Explore seven production-verified AI agents from $29/month, or get focused direction with
                the $49 Quick Marketing Audit. Every consequential action stays under human control.
              </>
            ) : (
              <>
                Get sharper content, stronger lead follow-up, and a clearer marketing plan. Seven AMS agents
                have proven capabilities, but new subscriptions are temporarily unavailable.
                Start with the $49 Quick Marketing Audit.
              </>
            )}
          </p>

          <div className={styles.heroActions}>
            <Link className={styles.primaryButton} href="/agents#catalog">
              Explore the agent network <span aria-hidden="true">→</span>
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
              <strong>AI</strong>
              <span>Tools for your business</span>
            </div>
            <div>
              <strong>{subscriptionCheckoutLive ? "$29" : "PAUSED"}</strong>
              <span>{subscriptionCheckoutLive ? "Plans start at / month" : "Subscription checkout"}</span>
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
                  <span className={styles.microLabel}>YOUR MARKETING WORKSPACE</span>
                  <h2>Work smarter. Stay in command.</h2>
                </div>
                <span className={styles.onlinePill}>Live</span>
              </div>

              <div className={styles.workflowCard}>
                <div className={styles.workflowTop}>
                  <span>Today&apos;s workflow</span>
                  <span>Human-controlled</span>
                </div>
                <h3>From brief to ready-for-review campaign</h3>
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
          <p className={styles.previewNote}>Illustrative product preview.</p>
        </div>
      </section>

      <section className={styles.trustBar} aria-label="AMS principles">
        <span>Small-business focused</span>
        <span>Human approval built in</span>
        <span>Clear service availability</span>
        <span>Clear pricing</span>
      </section>
      <section className={styles.brandStatement} aria-label="AMS brand promise">
        <div className={styles.brandStatementTop}>
          <span>ASPECT / BRAND PROMISE</span>
          <span>INTELLIGENCE WITH ACCOUNTABILITY</span>
        </div>
        <p>
          Always on. <em>Always working.</em>
          <strong> Built to grow your brand.</strong>
        </p>
        <div className={styles.brandKeywords} aria-label="Our pillars">
          <span>AUTOMATE</span><span>AMPLIFY</span><span>GROW</span>
        </div>
      </section>

      <p className={styles.lifecycleNote}>
        
      </p>

      <section className={styles.section} aria-labelledby="connected-data-privacy">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>Privacy and control</p>
            <h2 id="connected-data-privacy">Your business data deserves respect.</h2>
          </div>
          <p>
            AMS uses separately authorized Google account access for limited owner business
            notifications and inquiry handling. Customer Gmail accounts are not connected to
            this feature; only permitted owner actions can send messages. Learn more about
            access, data use and manual deletion in our{" "}
            <Link href="/privacy">privacy and Google data-use policy</Link>.
          </p>
        </div>
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
              <Link className={styles.outcomeLink} href={item.href}>
                Explore related agents <span aria-hidden="true">↗</span>
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className={cx("section", "agentSection")}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>{subscriptionCheckoutLive ? "Explore our AI marketing tools" : "Discover what AMS can do"}</p>
            <h2>Meet three proven AMS agents.</h2>
          </div>
          <p>
            {subscriptionCheckoutLive
              ? "Get useful content, lead magnets, and follow-up drafts. See which agent fits your next task."
              : "See what these three agents can do. New subscriptions are paused; check the Agent Store for availability."}
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
                Explore {agent.title} <span aria-hidden="true">→</span>
              </Link>
            </article>
          ))}
        </div>

        <div className={styles.centerAction}>
          <Link className={styles.secondaryButton} href="/agents#catalog">
            Browse all AMS agents
          </Link>
        </div>
      </section>

      <section className={cx("section", "experienceSection")} id="how-it-works">
        <div className={styles.experienceIntro}>
          <p className={styles.kicker}>How it works</p>
          <h2>Three steps. You're in control.</h2>
          <p>
            Choose an outcome, pick the right agent, and review any consequential action.
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

      <section className={styles.brandSignature} aria-label="Official Aspect Marketing Solutions wordmark">
        <Image src={AMS_BRAND_ASSETS.banner} width={1536} height={420} unoptimized alt="Aspect Marketing Solutions — AI Agents, Automation, Growth" />
      </section>

      <footer className={styles.footer}>
        <div className={styles.brand}>
          <span className={styles.brandMark}><Image src={AMS_BRAND_ASSETS.icon} width={42} height={42} alt="" unoptimized /></span>
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
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
        <p>© 2026 Aspect Marketing Solutions</p>
      </footer>
    </main>
  )
}
