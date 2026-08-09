import Link from "next/link"
import { cookies } from "next/headers"
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

import { verifyInternalAdminCookie } from "@/app/lib/internal-admin-cookie"
import { getCommandCenterTelemetry } from "@/lib/server/command-center-telemetry"

import styles from "./dashboard.module.css"

export const dynamic = "force-dynamic"

function configured(...names: string[]) {
  return names.every((name) => Boolean(process.env[name]?.trim()))
}

function stateLabel(state: boolean | string) {
  if (state === true || state === "ready" || state === "configured") return "Connected"
  if (state === "not_required") return "Not required"
  if (state === "not_approved") return "Not approved"
  if (state === "unavailable") return "Unavailable"
  if (state === "missing") return "Needs setup"
  return "Needs setup"
}

function stateClass(state: boolean | string) {
  if (state === true || state === "ready" || state === "configured") return styles.good
  if (state === "not_required") return styles.neutral
  return styles.warn
}

function formatMoney(cents: number | null, currency: string | null) {
  if (cents === null || !currency || currency === "mixed") return "—"

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2,
    }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`
  }
}

function formatTimestamp(value: string | null) {
  if (!value) return "time unavailable"

  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value))
  } catch {
    return value
  }
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const adminAccess = cookieStore.get("ams_internal_admin_access")?.value
  const expectedSecret = process.env.INTERNAL_ADMIN_SECRET?.trim()
  const adminSession = expectedSecret
    ? await verifyInternalAdminCookie(adminAccess, expectedSecret)
    : null

  if (!adminSession) {
    redirect("/admin/login?next=/dashboard")
  }

  const telemetry = await getCommandCenterTelemetry()
  const customerAuth = configured(
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "NEXTAUTH_SECRET",
    "NEXTAUTH_URL",
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
  const n8nWebhook = configured(
    "AMS_N8N_ORCHESTRATOR_WEBHOOK_URL",
    "AMS_N8N_INTERNAL_KEY",
    "AMS_APP_URL",
  )

  const n8nState = telemetry.n8n.online
    ? "ready"
    : telemetry.n8n.configured
      ? "unavailable"
      : "missing"
  const stripeState = telemetry.stripe.connected
    ? "ready"
    : telemetry.stripe.configured
      ? "unavailable"
      : "missing"

  const coreOperational = [true, telemetry.redis.state === "ready", telemetry.n8n.online, telemetry.stripe.connected]
  const coreConnectedCount = coreOperational.filter(Boolean).length
  const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown"
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? "unknown"
  const displayName = adminSession.email.split("@")[0]

  const systemRows = [
    ["Web application", "ready"],
    ["Internal admin access", "ready"],
    ["Customer authentication", customerAuth ? "configured" : "missing"],
    ["Redis persistence", telemetry.redis.state],
    ["n8n instance", n8nState],
    ["n8n orchestrator webhook", n8nWebhook ? "configured" : "missing"],
    ["Stripe reporting", stripeState],
    ["Fiverr intake", telemetry.fiverr.intakeConfigured ? "configured" : "missing"],
    ["xAI provider", xai ? "configured" : "missing"],
    ["Relevance AI", relevance ? "configured" : "missing"],
    ["Internal API auth", internalApi ? "configured" : "missing"],
  ] as const

  const stripeRevenue = formatMoney(
    telemetry.stripe.netCapturedCents,
    telemetry.stripe.currency,
  )

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
          <Link href="/dashboard#fiverr"><Activity size={18} /> Fiverr Operations</Link>
          <Link href="/quick-marketing-audit"><CircleDollarSign size={18} /> Revenue Offer</Link>
          <Link href="/billing"><CircleDollarSign size={18} /> Billing</Link>
          <Link href="/settings"><Settings size={18} /> Settings</Link>
          <Link href="/api/health"><ShieldCheck size={18} /> Raw Health</Link>
        </nav>

        <div className={styles.sideNote}>
          <ShieldCheck size={18} />
          <div>
            <strong>Internal operator surface</strong>
            <span>Protected by the AMS internal-admin session. No customer account can open this page.</span>
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
              <small>{adminSession.email}</small>
            </div>
          </div>
        </header>

        <div className={styles.content}>
          <section className={styles.heading}>
            <div>
              <p>AMS COMMAND CENTER</p>
              <h1>Control what is real. Build what is next.</h1>
              <span>
                Live operational signals now come from the running AMS application, Redis, n8n,
                Stripe, and the Fiverr Bridge. Configuration-only signals remain labeled as such.
              </span>
            </div>
            <div className={styles.headingActions}>
              <Link href="/agents">Open Agent Network</Link>
              <Link href="/">Public site ↗</Link>
            </div>
          </section>

          <section className={styles.metrics}>
            <article>
              <span>CORE SYSTEMS ONLINE</span>
              <strong>{coreConnectedCount}/4</strong>
              <small>Web · Redis · n8n · Stripe reporting checked at request time.</small>
            </article>
            <article>
              <span>STRIPE CAPTURED LESS REFUNDS · 30D</span>
              <strong>{telemetry.stripe.connected ? stripeRevenue : "—"}</strong>
              <small>
                {telemetry.stripe.connected
                  ? `${telemetry.stripe.successfulCharges ?? 0} successful charge${telemetry.stripe.successfulCharges === 1 ? "" : "s"} · ${telemetry.stripe.mode.toUpperCase()} mode${telemetry.stripe.partial ? " · partial window" : ""}`
                  : telemetry.stripe.error ?? "Stripe reporting is not connected."}
              </small>
            </article>
            <article>
              <span>N8N INSTANCE</span>
              <strong className={stateClass(n8nState)}>{telemetry.n8n.online ? "ONLINE" : "OFFLINE"}</strong>
              <small>
                {telemetry.n8n.online
                  ? `${telemetry.n8n.latencyMs ?? "—"} ms · ${telemetry.n8n.host ?? "configured host"}`
                  : telemetry.n8n.error ?? "n8n is not configured"}
              </small>
            </article>
            <article>
              <span>REDIS PERSISTENCE</span>
              <strong className={stateClass(telemetry.redis.state)}>{telemetry.redis.state.toUpperCase()}</strong>
              <small>{telemetry.redis.checked ? `${telemetry.redis.latencyMs ?? "—"} ms last readiness check` : "Readiness check unavailable"}</small>
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
                  <small>Operator command layer</small>
                </div>
                <div className={styles.connectionNodes}>
                  {[
                    ["Admin", true, "Authenticated"],
                    ["Redis", telemetry.redis.state === "ready", telemetry.redis.state],
                    ["n8n", telemetry.n8n.online, telemetry.n8n.online ? `${telemetry.n8n.latencyMs ?? "—"} ms` : "Offline"],
                    ["Stripe", telemetry.stripe.connected, telemetry.stripe.connected ? telemetry.stripe.mode : "Unavailable"],
                    ["Fiverr", telemetry.fiverr.intakeConfigured, telemetry.fiverr.intakeConfigured ? "Intake configured" : "Needs setup"],
                    ["xAI", xai, xai ? "Configured" : "Needs setup"],
                    ["Relevance", relevance, relevance ? "Configured" : "Needs setup"],
                    ["Customer Auth", customerAuth, customerAuth ? "Configured" : "Needs setup"],
                  ].map(([label, state, detail]) => (
                    <div key={String(label)} className={styles.connectionNode}>
                      <span className={state ? styles.dotGood : styles.dotWarn} />
                      <strong>{String(label)}</strong>
                      <small>{String(detail)}</small>
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
                <Link href="/dashboard#fiverr">Review Fiverr events <span>→</span></Link>
                <Link href="/quick-marketing-audit">Open $49 audit offer <span>→</span></Link>
                <Link href="/billing">Review billing <span>→</span></Link>
                <Link href="/api/health">View raw health JSON <span>→</span></Link>
              </div>
            </article>

            <article className={styles.panelWide} id="fiverr">
              <div className={styles.panelHeader}>
                <div>
                  <p>FIVERR OPERATIONS</p>
                  <h2>Events requiring operator awareness</h2>
                </div>
                <FileText size={22} />
              </div>

              {telemetry.fiverr.recentOperations.length ? (
                <div className={styles.operationsList}>
                  {telemetry.fiverr.recentOperations.map((operation) => (
                    <article className={styles.operation} key={operation.event_id}>
                      <div className={styles.operationTopline}>
                        <span className={styles[`priority_${operation.priority}`]}>{operation.priority.toUpperCase()}</span>
                        <small>{formatTimestamp(operation.received_at ?? operation.recorded_at)}</small>
                      </div>
                      <h3>{titleCase(operation.event_type)}</h3>
                      <p>{operation.subject || "Fiverr notification"}</p>
                      <div className={styles.operationMeta}>
                        {operation.buyer_username ? <span>Buyer: {operation.buyer_username}</span> : null}
                        {operation.order_reference ? <span>Order: {operation.order_reference}</span> : null}
                        <span>Next: {titleCase(operation.recommended_action)}</span>
                        {operation.deadline_at ? <span>Deadline: {formatTimestamp(operation.deadline_at)}</span> : null}
                        {operation.quick_audit_match ? <span>Quick Audit match</span> : null}
                      </div>
                      <small className={styles.approvalNote}>Human approval required · no automatic Fiverr actions</small>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <Activity size={30} />
                  <div>
                    <strong>No persisted Fiverr operations yet.</strong>
                    <p>
                      New accepted Fiverr Bridge events will appear here after the intake receives them.
                      The Bridge classifies and records events, but it does not send Fiverr messages,
                      accept orders, cancel orders, click links, or submit deliveries automatically.
                    </p>
                  </div>
                </div>
              )}
            </article>

            <article className={styles.panelWide}>
              <div className={styles.panelHeader}>
                <div>
                  <p>TELEMETRY CHECK</p>
                  <h2>What this dashboard actually checked</h2>
                </div>
                <Activity size={22} />
              </div>
              <div className={styles.telemetrySummary}>
                <span>Checked {formatTimestamp(telemetry.checkedAt)}</span>
                <span>Redis: {telemetry.redis.state}</span>
                <span>n8n: {telemetry.n8n.online ? "online" : "offline"}</span>
                <span>Stripe: {telemetry.stripe.connected ? `${telemetry.stripe.mode} connected` : "unavailable"}</span>
                <span>Fiverr intake: {telemetry.fiverr.intakeConfigured ? "configured" : "missing"}</span>
              </div>
            </article>
          </section>
        </div>
      </section>
    </main>
  )
}
