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
import { telemetryStatus } from "@/lib/operations/telemetry-status"
import { getCommandCenterTelemetry } from "@/lib/server/command-center-telemetry"
import { getOperationsTelemetry } from "@/lib/server/operations-telemetry"
import { reportingPreviewEnabled, isReportingOwnerEmail } from "@/lib/server/operations-report-store"
import OperationsReporting from "./OperationsReporting"

import { agentStatusCounts, agents } from "@/app/agents/agentCatalog"

import styles from "./dashboard.module.css"
import opsStyles from "./dashboard-operations.module.css"

export const dynamic = "force-dynamic"

function configured(...names: string[]) {
  return names.every((name) => Boolean(process.env[name]?.trim()))
}

function stateLabel(state: boolean | string) {
  return telemetryStatus(state).label
}

function stateClass(state: boolean | string) {
  return styles[telemetryStatus(state).tone]
}

function priorityClass(priority: "normal" | "high" | "urgent") {
  if (priority === "urgent") return opsStyles.priority_urgent
  if (priority === "high") return opsStyles.priority_high
  return opsStyles.priority_normal
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
  const adminEmail = adminSession?.email

  if (!adminEmail) {
    redirect("/admin/login?next=/dashboard")
  }

  const telemetry = await getCommandCenterTelemetry()
  const reportingOwner = isReportingOwnerEmail(adminEmail)
  const operations = reportingPreviewEnabled() && reportingOwner ? await getOperationsTelemetry() : null
  const customerAuth = configured(
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "NEXTAUTH_SECRET",
    "NEXTAUTH_URL",
  )
  const contentAgentLaunchEnabled =
    process.env.NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE?.trim().toLowerCase() === "true"
  const aiGatewayAuth = Boolean(
    process.env.AI_GATEWAY_API_KEY?.trim() ||
      process.env.VERCEL_OIDC_TOKEN?.trim() ||
      (process.env.VERCEL === "1" && process.env.VERCEL_ENV?.trim()),
  )
  const aiGatewayState = contentAgentLaunchEnabled
    ? aiGatewayAuth
      ? "configured"
      : "missing"
    : "not_required"
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

  const coreOperational = [telemetry.redis.state === "ready", telemetry.n8n.online, telemetry.stripe.connected]
  const coreConnectedCount = coreOperational.filter(Boolean).length
  const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown"
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? "unknown"
  const displayName = adminEmail.split("@")[0]

  const systemRows = [
    ["Web application", "ready"],
    ["Internal admin access", "ready"],
    ["Customer authentication", customerAuth ? "configured" : "missing"],
    ["Redis persistence", telemetry.redis.state],
    ["n8n instance", n8nState],
    ["n8n orchestrator webhook", n8nWebhook ? "configured" : "missing"],
    ["Stripe reporting", stripeState],
    ["Fiverr intake", telemetry.fiverr.intakeConfigured ? "configured" : "missing"],
    ["Content Agent AI Gateway", aiGatewayState],
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
              <small>{adminEmail}</small>
            </div>
          </div>
        </header>

        <div className={styles.content}>
          <section className={styles.heading}>
            <div>
              <p>AMS COMMAND CENTER</p>
              <h1>Control what is real. Build what is next.</h1>
              <span>
                Request-time signals come from the running AMS application, Redis, n8n,
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
              <span>SUCCESSFUL DEPENDENCY CHECKS</span>
              <strong>{coreConnectedCount}/3</strong>
              <small>Redis readiness · n8n health endpoint · Stripe reporting API. Not an end-to-end workflow verification.</small>
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
              <strong className={stateClass(n8nState)}>{telemetry.n8n.online ? "ONLINE" : "UNAVAILABLE"}</strong>
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
                    ["n8n", telemetry.n8n.online, telemetry.n8n.online ? `${telemetry.n8n.latencyMs ?? "—"} ms` : "Unavailable"],
                    ["Stripe", telemetry.stripe.connected, telemetry.stripe.connected ? telemetry.stripe.mode : "Unavailable"],
                    ["Fiverr", null, telemetry.fiverr.intakeConfigured ? "Configured; not verified" : "Needs setup"],
                    [
                      "AI Gateway",
                      null,
                      contentAgentLaunchEnabled
                        ? aiGatewayAuth
                          ? "Configured; not verified"
                          : "Needs setup"
                        : "Execution paused",
                    ],
                    ["Relevance", null, relevance ? "Configured; not verified" : "Needs setup"],
                    ["Customer Auth", null, customerAuth ? "Configured; not verified" : "Needs setup"],
                  ].map(([label, state, detail]) => (
                    <div key={String(label)} className={styles.connectionNode}>
                      <span className={state === null ? `${styles.dotWarn} ${styles.neutral}` : state ? styles.dotGood : styles.dotWarn} />
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
                <div><strong>{agentStatusCounts.live}</strong><span>Live</span></div>
                <div><strong>{agentStatusCounts.beta}</strong><span>Beta</span></div>
                <div><strong>{agentStatusCounts["setup-required"]}</strong><span>Setup required</span></div>
                <div><strong>{agentStatusCounts.planned}</strong><span>Planned</span></div>
                <div><strong>{agentStatusCounts.blocked}</strong><span>Blocked</span></div>
              </div>
              <Link className={styles.panelLink} href="/agents">Review all {agents.length} agents →</Link>
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

              <p>Source: {telemetry.fiverr.source} · Checked {formatTimestamp(telemetry.fiverr.checkedAt)} · Latest recorded event: {formatTimestamp(telemetry.fiverr.recentOperations[0]?.recorded_at ?? null)}</p>
              {telemetry.fiverr.state !== "ready" ? (
                <div className={styles.emptyState} role="status">
                  <Activity size={30} />
                  <div><strong>Fiverr operations unavailable. Queue state unknown.</strong><p>{telemetry.fiverr.error}</p></div>
                </div>
              ) : telemetry.fiverr.recentOperations.length ? (
                <div className={opsStyles.operationsList}>
                  {telemetry.fiverr.recentOperations.map((operation) => (
                    <article className={opsStyles.operation} key={operation.event_id}>
                      <div className={opsStyles.operationTopline}>
                        <span className={priorityClass(operation.priority)}>{operation.priority.toUpperCase()}</span>
                        <small>{formatTimestamp(operation.received_at ?? operation.recorded_at)}</small>
                      </div>
                      <h3>{titleCase(operation.event_type)}</h3>
                      <p>{operation.subject || "Fiverr notification"}</p>
                      <div className={opsStyles.operationMeta}>
                        {operation.buyer_username ? <span>Buyer: {operation.buyer_username}</span> : null}
                        {operation.order_reference ? <span>Order: {operation.order_reference}</span> : null}
                        <span>Next: {titleCase(operation.recommended_action)}</span>
                        {operation.deadline_at ? <span>Deadline: {formatTimestamp(operation.deadline_at)}</span> : null}
                        {operation.quick_audit_match ? <span>Quick Audit match</span> : null}
                      </div>
                      <small className={opsStyles.approvalNote}>Human approval required · no automatic Fiverr actions</small>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <Activity size={30} />
                  <div>
                    <strong>No records returned by this successful storage query.</strong>
                    <p>
                      This checks up to eight persisted Bridge records, not the Fiverr inbox or completeness of intake. New accepted events appear after intake records them.
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
              <div className={opsStyles.telemetrySummary}>
                <span>Request checks completed {formatTimestamp(telemetry.checkedAt)}; not a continuous monitor. Refresh to recheck.</span>
                <span>Source: Redis readiness probe · {telemetry.redis.state}</span>
                <span>Source: n8n /healthz · {telemetry.n8n.online ? "online" : "unavailable"}</span>
                <span>Source: Stripe charges API · {telemetry.stripe.connected ? `${telemetry.stripe.mode} connected` : "unavailable"}</span>
                <span>Fiverr intake: {telemetry.fiverr.intakeConfigured ? "Configured; not verified" : "missing"}</span>
              </div>
            </article>
          </section>
          {operations ? <OperationsReporting data={operations} repoSha={process.env.VERCEL_GIT_COMMIT_SHA ?? ""} /> : null}
        </div>
      </section>
    </main>
  )
}