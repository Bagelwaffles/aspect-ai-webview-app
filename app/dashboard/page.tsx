import { getServerSession } from "next-auth"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  Activity,
  Bot,
  Boxes,
  CircleDollarSign,
  Cpu,
  FileText,
  Gauge,
  KeyRound,
  Network,
  Settings,
  ShieldCheck,
  Workflow,
} from "lucide-react"

import { authOptions, isCustomerAuthConfigured } from "@/lib/auth"
import { checkRedisReadiness } from "@/lib/server/redis-readiness"

import styles from "./dashboard.module.css"

export const dynamic = "force-dynamic"

function configured(...names: string[]) {
  return names.every((name) => Boolean(process.env[name]?.trim()))
}

function stateLabel(state: boolean | string) {
  if (state === true || state === "ready" || state === "configured") return "Connected"
  if (state === "not_required") return "Not required"
  if (state === "not_approved") return "Not approved"
  return "Needs setup"
}

function stateClass(state: boolean | string) {
  if (state === true || state === "ready" || state === "configured") return styles.good
  if (state === "not_required") return styles.neutral
  return styles.warn
}

export default async function DashboardPage() {
  if (!isCustomerAuthConfigured()) {
    redirect("/login?next=/dashboard")
  }

  const session = await getServerSession(authOptions).catch(() => null)
  if (!session?.user?.email) {
    redirect("/login?next=/dashboard")
  }

  const redis = await checkRedisReadiness()
  const customerAuth = configured(
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "NEXTAUTH_SECRET",
    "NEXTAUTH_URL",
  )
  const stripe = configured(
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "AMS_STRIPE_STARTER_PRICE_ID",
    "AMS_STRIPE_GROWTH_PRICE_ID",
    "AMS_STRIPE_PRO_PRICE_ID",
  )
  const n8n = configured(
    "AMS_N8N_URL",
    "AMS_N8N_ORCHESTRATOR_WEBHOOK_URL",
    "AMS_N8N_INTERNAL_KEY",
    "AMS_APP_URL",
  )
  const xai = configured("XAI_API_KEY", "XAI_MODEL")
  const relevance = configured(
    "RELEVANCE_API_KEY",
    "RELEVANCE_AUTH_TOKEN",
    "RELEVANCE_REGION",
    "RELEVANCE_PROJECT_ID",
    "RELEVANCE_AGENT_API_URL",
  )
  const internalApi = configured("AMS_INTERNAL_API_KEY")

  const dependencyStates = [customerAuth, stripe, n8n, xai, relevance, internalApi]
  const connectedCount = dependencyStates.filter(Boolean).length
  const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown"
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? "unknown"
  const displayName = session.user.name?.trim() || session.user.email.split("@")[0]

  const systemRows = [
    ["Web application", true],
    ["Customer authentication", customerAuth],
    ["Redis persistence", redis.state],
    ["n8n gateway", n8n],
    ["Stripe app billing", stripe],
    ["xAI provider", xai],
    ["Relevance AI", relevance],
    ["Internal API auth", internalApi],
  ] as const

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.brand} aria-label="Aspect Marketing Solutions home">
          <span className={styles.brandMark}>A</span>
          <span>
            <strong>ASPECT</strong>
            <small>MARKETING SOLUTIONS</small>
          </span>
        </Link>

        <nav className={styles.nav} aria-label="Command center navigation">
          <p>CORE</p>
          <Link className={styles.active} href="/dashboard"><Gauge size={18} /> Dashboard</Link>
          <Link href="/agents"><Bot size={18} /> Agent Network</Link>
          <Link href="/workflows"><Workflow size={18} /> Workflows</Link>
          <Link href="/deployments"><Boxes size={18} /> Deployments</Link>
          <Link href="/analytics"><Activity size={18} /> Analytics</Link>
          <p>OPERATIONS</p>
          <Link href="/quick-marketing-audit"><CircleDollarSign size={18} /> Revenue Offer</Link>
          <Link href="/billing"><CircleDollarSign size={18} /> Billing</Link>
          <Link href="/settings"><Settings size={18} /> Settings</Link>
          <Link href="/api/health"><ShieldCheck size={18} /> Raw Health</Link>
        </nav>

        <div className={styles.sideNote}>
          <ShieldCheck size={18} />
          <div>
            <strong>Truth-first controls</strong>
            <span>No decorative revenue, uptime, runs, or sales data.</span>
          </div>
        </div>
      </aside>

      <section className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <span className={styles.envBadge}>{environment.toUpperCase()}</span>
            <span className={styles.commit}>COMMIT {commit}</span>
          </div>
          <div className={styles.userBlock}>
            <span className={styles.avatar}>{displayName.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{displayName}</strong>
              <small>{session.user.email}</small>
            </div>
          </div>
        </header>

        <div className={styles.content}>
          <section className={styles.heading}>
            <div>
              <p>AMS COMMAND CENTER</p>
              <h1>Control what is real. Build what is next.</h1>
              <span>
                This is the operating surface for AMS. Every metric shown here is either derived from
                the running application or clearly marked as not connected yet.
              </span>
            </div>
            <div className={styles.headingActions}>
              <Link href="/agents">Open Agent Network</Link>
              <Link href="/">Public site ↗</Link>
            </div>
          </section>

          <section className={styles.metrics}>
            <article>
              <span>CONNECTED DEPENDENCIES</span>
              <strong>{connectedCount}/6</strong>
              <small>Configuration presence only; not a claim of end-to-end health.</small>
            </article>
            <article>
              <span>AGENT CATALOG</span>
              <strong>32</strong>
              <small>0 Live · 1 Beta · 5 In Development · 26 Coming Soon</small>
            </article>
            <article>
              <span>REDIS PERSISTENCE</span>
              <strong className={stateClass(redis.state)}>{redis.state.toUpperCase()}</strong>
              <small>{redis.checked ? `${redis.latencyMs ?? "—"} ms last readiness check` : "Readiness check unavailable"}</small>
            </article>
            <article>
              <span>REVENUE DATA</span>
              <strong>—</strong>
              <small>Not displayed until Stripe reporting is connected to this dashboard.</small>
            </article>
          </section>

          <section className={styles.grid}>
            <article className={styles.panelLarge}>
              <div className={styles.panelHeader}>
                <div>
                  <p>SYSTEM OVERVIEW</p>
                  <h2>Operational connections</h2>
                </div>
                <Network size={22} />
              </div>
              <div className={styles.connectionMap}>
                <div className={styles.coreNode}>
                  <Cpu size={28} />
                  <strong>AMS</strong>
                  <small>Web + command layer</small>
                </div>
                <div className={styles.connectionNodes}>
                  {[
                    ["Auth", customerAuth],
                    ["Redis", redis.state === "ready"],
                    ["n8n", n8n],
                    ["Stripe", stripe],
                    ["xAI", xai],
                    ["Relevance", relevance],
                  ].map(([label, state]) => (
                    <div key={String(label)} className={styles.connectionNode}>
                      <span className={state ? styles.dotGood : styles.dotWarn} />
                      <strong>{String(label)}</strong>
                      <small>{state ? "Configured" : "Needs setup"}</small>
                    </div>
                  ))}
                </div>
              </div>
            </article>

            <article className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <p>SYSTEM STATUS</p>
                  <h2>Readiness board</h2>
                </div>
                <ShieldCheck size={22} />
              </div>
              <div className={styles.statusList}>
                {systemRows.map(([label, state]) => (
                  <div key={label}>
                    <span className={stateClass(state)} />
                    <strong>{label}</strong>
                    <small>{stateLabel(state)}</small>
                  </div>
                ))}
              </div>
            </article>

            <article className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <p>AGENT LIFECYCLE</p>
                  <h2>What can be claimed today</h2>
                </div>
                <Bot size={22} />
              </div>
              <div className={styles.lifecycle}>
                <div><strong>0</strong><span>Live</span></div>
                <div><strong>1</strong><span>Beta</span></div>
                <div><strong>5</strong><span>In development</span></div>
                <div><strong>26</strong><span>Coming soon</span></div>
              </div>
              <Link className={styles.panelLink} href="/agents">Review all 32 agents →</Link>
            </article>

            <article className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <p>QUICK ACTIONS</p>
                  <h2>Operator shortcuts</h2>
                </div>
                <KeyRound size={22} />
              </div>
              <div className={styles.actions}>
                <Link href="/workflows">Open workflows <span>→</span></Link>
                <Link href="/deployments">Inspect deployments <span>→</span></Link>
                <Link href="/quick-marketing-audit">Open $49 audit offer <span>→</span></Link>
                <Link href="/billing">Review billing <span>→</span></Link>
                <Link href="/api/health">View raw health JSON <span>→</span></Link>
              </div>
            </article>

            <article className={styles.panelWide}>
              <div className={styles.panelHeader}>
                <div>
                  <p>ACTIVITY FEED</p>
                  <h2>Real events only</h2>
                </div>
                <FileText size={22} />
              </div>
              <div className={styles.emptyState}>
                <Activity size={30} />
                <div>
                  <strong>No fabricated activity feed.</strong>
                  <p>
                    Deployment events, agent runs, n8n executions, purchases, and publishing events will
                    appear here only after their authoritative data sources are wired into the Command Center.
                  </p>
                </div>
              </div>
            </article>
          </section>
        </div>
      </section>
    </main>
  )
}
