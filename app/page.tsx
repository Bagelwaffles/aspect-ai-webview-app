import Image from "next/image"
import Link from "next/link"
import { ArrowRight, BadgeCheck, BarChart3, Check, Clock3, FileText, Mail, Magnet, MessageSquareMore, PackageOpen, Search, ShieldCheck, Sparkles, Users, WandSparkles } from "lucide-react"

import { AmsPublicFooter } from "@/components/ams-public-footer"
import { AmsPublicHeader } from "@/components/ams-public-header"
import styles from "./home-saas.module.css"

const liveAgents = [
  { name: "Content Agent", result: "Turn a brief into useful marketing content.", image: "/agent-assets/content-agent.webp", href: "/agents/content-agent", icon: FileText, color: "cyan" },
  { name: "Lead Magnet Agent", result: "Create an offer that earns attention and leads.", image: "/agent-assets/lead-magnet-agent.webp", href: "/agents/lead-magnet-agent", icon: Magnet, color: "violet" },
  { name: "Email Campaign Agent", result: "Build a clear 3, 5, or 7-email campaign.", image: "/agent-assets/email-campaign-agent.webp", href: "/agents/email-campaign-agent", icon: Mail, color: "green" },
  { name: "Nurture Agent", result: "Keep good leads moving with thoughtful follow-up.", image: "/agent-assets/nurture-agent.webp", href: "/agents/nurture-agent", icon: Users, color: "orange" },
  { name: "Outreach Agent", result: "Draft focused messages for real prospects.", image: "/agent-assets/outreach-agent.webp", href: "/agents/outreach-agent", icon: MessageSquareMore, color: "pink" },
  { name: "SEO Agent", result: "Plan pages people and search engines understand.", image: "/agent-assets/seo-agent.webp", href: "/agents/seo-agent", icon: Search, color: "cyan" },
  { name: "Product Creator Agent", result: "Shape an idea into a launch-ready offer.", image: "/agent-assets/product-creator-agent.webp", href: "/agents/product-creator-agent", icon: PackageOpen, color: "violet" },
] as const

const outcomes = [
  { icon: WandSparkles, title: "Create consistently", copy: "Move from idea to useful content, campaigns, and offers without staring at a blank page." },
  { icon: Magnet, title: "Turn attention into leads", copy: "Build focused lead magnets and follow-up that give interested people a clear next step." },
  { icon: BarChart3, title: "Make growth easier to manage", copy: "Use the right specialist for each job while keeping the final decision in your hands." },
] as const

const steps = [
  { number: "01", title: "Choose the result you need", copy: "Start with content, lead generation, email, nurture, outreach, SEO, or product creation." },
  { number: "02", title: "Give the agent useful context", copy: "Answer a focused set of questions so the work reflects your business, audience, and offer." },
  { number: "03", title: "Review and use the finished draft", copy: "You stay in control. Public actions, publishing, payments, and account changes are never hidden behind automation." },
] as const

export default function HomePage() {
  return (
    <div className={styles.page}>
      <AmsPublicHeader />
      <main>
        <section className={styles.hero}>
          <div className={styles.heroGlow} aria-hidden="true" />
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <div className={styles.eyebrow}><span className={styles.liveDot} />7 AI agents available today</div>
              <h1>Your marketing team,<span>ready when you are.</span></h1>
              <p className={styles.heroLead}>Create better content, capture more leads, follow up consistently, and launch ideas faster—with seven practical AI agents built for small businesses.</p>
              <div className={styles.heroActions}>
                <Link className={styles.primaryButton} href="/pricing#plans">Start from $29/month <ArrowRight aria-hidden="true" size={18} /></Link>
                <Link className={styles.secondaryButton} href="/quick-marketing-audit">Start with the $49 audit</Link>
              </div>
              <div className={styles.heroReassurance}>
                <span><Check aria-hidden="true" size={15} /> No long-term contract</span>
                <span><Check aria-hidden="true" size={15} /> Human review built in</span>
                <span><Check aria-hidden="true" size={15} /> Clear availability</span>
              </div>
              <Link className={styles.textLink} href="/agents">Meet the 7 Live agents <ArrowRight aria-hidden="true" size={15} /></Link>
            </div>

            <div className={styles.heroVisual}>
              <div className={styles.visualChrome}>
                <div className={styles.visualTopbar}><div><i /><i /><i /></div><span>AMS · LIVE AGENT TEAM</span><b><span /> ONLINE</b></div>
                <div className={styles.collageFrame}>
                  <Image src="/agent-assets/live-agent-showcase.webp" alt="The seven Live AMS agents for content, lead magnets, email, nurture, outreach, SEO, and product creation" fill priority sizes="(max-width: 920px) calc(100vw - 40px), 48vw" />
                </div>
                <div className={styles.visualFooter}><span><BadgeCheck aria-hidden="true" size={16} /> Production verified</span><span>33 agents in the full catalog</span></div>
              </div>
              <div className={styles.floatingProof}><Sparkles aria-hidden="true" size={18} /><div><strong>Built for real work</strong><span>Not another generic chatbot</span></div></div>
            </div>
          </div>
        </section>

        <section className={styles.proofBar} aria-label="AMS customer promises">
          <span><ShieldCheck aria-hidden="true" size={18} /> You approve what matters</span>
          <span><Clock3 aria-hidden="true" size={18} /> Always ready to help</span>
          <span><BadgeCheck aria-hidden="true" size={18} /> Only verified agents sold as Live</span>
          <span><Sparkles aria-hidden="true" size={18} /> Built for small business</span>
        </section>

        <section className={styles.startSection}>
          <div className={styles.sectionIntro}><p>Choose your starting point</p><h2>Get ongoing help—or one clear answer.</h2><span>Two simple ways to start, depending on what your business needs today.</span></div>
          <div className={styles.startGrid}>
            <article className={styles.subscriptionCard}>
              <div className={styles.cardPill}>Most flexible</div><div className={styles.startIcon}><Sparkles aria-hidden="true" /></div><p>AMS subscription</p><h3>Seven agents. One shared plan.</h3>
              <p className={styles.startCopy}>Use every Live agent with one monthly credit pool. Pick the plan that matches how much work you want to get done.</p>
              <div className={styles.price}><strong>From $29</strong><span>/ month</span></div>
              <ul><li><Check aria-hidden="true" /> All 7 Live agents</li><li><Check aria-hidden="true" /> Shared monthly credits</li><li><Check aria-hidden="true" /> Human-reviewed outputs</li></ul>
              <Link href="/pricing#plans">Compare plans <ArrowRight aria-hidden="true" size={17} /></Link>
            </article>
            <article className={styles.auditCard}>
              <div className={styles.startIcon}><BarChart3 aria-hidden="true" /></div><p>Quick Marketing Audit</p><h3>Know what to fix first.</h3>
              <p className={styles.startCopy}>Get a focused review of your marketing, stronger messaging, prioritized fixes, and a practical 7-day action plan.</p>
              <div className={styles.price}><strong>$49</strong><span>one time</span></div>
              <ul><li><Check aria-hidden="true" /> No subscription required</li><li><Check aria-hidden="true" /> Clear priorities</li><li><Check aria-hidden="true" /> Practical next steps</li></ul>
              <Link href="/quick-marketing-audit">Get my audit <ArrowRight aria-hidden="true" size={17} /></Link>
            </article>
          </div>
        </section>

        <section className={styles.outcomeSection}>
          <div className={styles.sectionIntro}><p>What gets easier</p><h2>Less marketing busywork. More useful momentum.</h2><span>AMS organizes AI around the work you already need to do—not around complicated technology.</span></div>
          <div className={styles.outcomeGrid}>{outcomes.map((outcome) => { const Icon = outcome.icon; return <article key={outcome.title}><div><Icon aria-hidden="true" /></div><h3>{outcome.title}</h3><p>{outcome.copy}</p></article> })}</div>
        </section>

        <section className={styles.agentsSection}>
          <div className={styles.sectionIntroRow}><div className={styles.sectionIntro}><p>Meet your Live team</p><h2>Seven specialists. Zero guesswork.</h2><span>Each agent has a focused job, a clear sales page, and a verified production path.</span></div><Link href="/agents">Explore all 33 agents <ArrowRight aria-hidden="true" size={17} /></Link></div>
          <div className={styles.agentGrid}>{liveAgents.map((agent) => { const Icon = agent.icon; return (
            <Link className={styles.agentCard} data-color={agent.color} href={agent.href} key={agent.name}>
              <div className={styles.agentImage}><Image src={agent.image} alt={`${agent.name} artwork`} fill sizes="(max-width: 680px) 44vw, (max-width: 1060px) 28vw, 220px" /><span><i /> Live</span></div>
              <div className={styles.agentBody}><div><Icon aria-hidden="true" size={17} /></div><h3>{agent.name}</h3><p>{agent.result}</p><span>See what it does <ArrowRight aria-hidden="true" size={15} /></span></div>
            </Link>
          ) })}</div>
          <p className={styles.lifecycleNote}>Five clear statuses across the full catalog: Live, Beta, Setup Required, Blocked, and Planned.</p>
        </section>

        <section className={styles.howSection}><div className={styles.howPanel}>
          <div className={styles.howIntro}><p>Simple by design</p><h2>Useful in minutes. Controlled from start to finish.</h2><span>There is no complicated setup just to create your first result.</span><Link href="/pricing#plans">Choose a plan <ArrowRight aria-hidden="true" size={17} /></Link></div>
          <div className={styles.steps}>{steps.map((step) => <article key={step.number}><span>{step.number}</span><div><h3>{step.title}</h3><p>{step.copy}</p></div></article>)}</div>
        </div></section>

        <section className={styles.finalCta}><div className={styles.finalGlow} aria-hidden="true" /><p>Ready to make marketing feel lighter?</p><h2>Put seven AI agents on your team today.</h2><span>Start from $29/month, or begin with the $49 one-time marketing audit.</span><div><Link className={styles.primaryButton} href="/pricing#plans">View plans <ArrowRight aria-hidden="true" size={18} /></Link><Link className={styles.secondaryButton} href="/quick-marketing-audit">Start with the $49 audit</Link></div></section>
      </main>
      <AmsPublicFooter />
    </div>
  )
}
