import { createHash, createHmac, timingSafeEqual } from "node:crypto"

import { Redis } from "@upstash/redis"
import Stripe from "stripe"

import { agents } from "@/app/agents/agentCatalog"
import { listAgentContracts } from "@/lib/agent-contract-registry"
import { listOvermindTasks } from "@/lib/server/overmind-task-store"
import { listRecentFiverrOperations } from "@/lib/server/fiverr-operations"
import { listSocialCampaignRecords } from "@/lib/server/social-campaign-store"
import {
  getLatestTwitchMediaQueue,
} from "@/lib/server/twitch-media-factory"
import {
  isTwitchShortRenderConfigured,
  listLatestTwitchShortRenderJobs,
} from "@/lib/server/twitch-short-render-jobs"
import { isR2AssetStorageConfigured } from "@/lib/server/r2-presign"
import { checkRedisReadiness } from "@/lib/server/redis-readiness"
import { isInternalApiConfigured } from "@/lib/server/internal-api-auth"

export type BackendMonitorStatus =
  | "ok"
  | "info"
  | "warning"
  | "critical"
  | "not_configured"

export type BackendMonitorResult = {
  key: string
  title: string
  status: BackendMonitorStatus
  summary: string
  checkedAt: string
  details: string[]
  metrics: Record<string, string | number | boolean | null>
  fingerprint: string
}

export type BackendMonitorEvent = {
  id: string
  monitorKey: string
  monitorTitle: string
  fromStatus: BackendMonitorStatus | null
  toStatus: BackendMonitorStatus
  summary: string
  details: string[]
  createdAt: string
  fingerprint: string
  recovery: boolean
}

export type BackendMonitoringSnapshot = {
  version: "backend-monitoring-v1"
  checkedAt: string
  overallStatus: BackendMonitorStatus
  results: BackendMonitorResult[]
  newEvents: BackendMonitorEvent[]
}

const MONITORING_PREFIX = "ams:monitoring:v1"
const LATEST_KEY = `${MONITORING_PREFIX}:latest`
const EVENT_INDEX_KEY = `${MONITORING_PREFIX}:events`
const EVENT_TTL_SECONDS = 60 * 60 * 24 * 90
const MAX_EVENTS = 300
const FETCH_TIMEOUT_MS = 8_000
const QUICK_AUDIT_WINDOW_HOURS = 6
const STRIPE_EVENT_WINDOW_HOURS = 6
const STALE_TASK_HOURS = 24
const STALE_PUBLISH_MINUTES = 45
const PLAY_VERIFICATION_DEADLINE = "2026-09-30T23:59:59-04:00"

type MonitorContext = {
  now: Date
  env: NodeJS.ProcessEnv
  redis: Redis | null
  fetcher: typeof fetch
}

function clean(value: string | undefined) {
  const normalized = value?.trim()
  return normalized || null
}

function redisConfiguration(env: NodeJS.ProcessEnv) {
  const url = clean(env.UPSTASH_REDIS_REST_URL) ?? clean(env.KV_REST_API_URL)
  const token = clean(env.UPSTASH_REDIS_REST_TOKEN) ?? clean(env.KV_REST_API_TOKEN)
  return url && token ? { url, token } : null
}

function createRedis(env: NodeJS.ProcessEnv) {
  const configuration = redisConfiguration(env)
  return configuration ? new Redis(configuration) : null
}

function sha(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
    .join(",")}}`
}

function result(
  key: string,
  title: string,
  status: BackendMonitorStatus,
  summary: string,
  checkedAt: string,
  details: string[] = [],
  metrics: Record<string, string | number | boolean | null> = {},
): BackendMonitorResult {
  const payload = { key, status, summary, details, metrics }
  return {
    key,
    title,
    status,
    summary,
    checkedAt,
    details,
    metrics,
    fingerprint: sha(stable(payload)),
  }
}

export function monitorStatusRank(status: BackendMonitorStatus) {
  switch (status) {
    case "critical":
      return 5
    case "warning":
      return 4
    case "not_configured":
      return 3
    case "info":
      return 2
    case "ok":
    default:
      return 1
  }
}

function worstStatus(results: BackendMonitorResult[]) {
  return results.reduce<BackendMonitorStatus>(
    (worst, current) =>
      monitorStatusRank(current.status) > monitorStatusRank(worst)
        ? current.status
        : worst,
    "ok",
  )
}

export function isStaleAt(
  timestamp: string | null | undefined,
  now: Date,
  ageMs: number,
) {
  if (!timestamp) return false
  const parsed = Date.parse(timestamp)
  return Number.isFinite(parsed) && now.getTime() - parsed >= ageMs
}

export function extractLiveAgentCountsFromText(value: string) {
  const counts = new Set<number>()
  for (const match of value.matchAll(/\b(\d{1,3})\s+(?:commercial\s+)?live\s+agents?\b/giu)) {
    const count = Number(match[1])
    if (Number.isFinite(count)) counts.add(count)
  }
  return [...counts]
}

async function fetchText(fetcher: typeof fetch, url: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetcher(url, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "AMS-Backend-Monitor/1.0" },
    })
    const text = await response.text()
    return { ok: response.ok, status: response.status, text: text.slice(0, 1_500_000) }
  } catch {
    return { ok: false, status: null as number | null, text: "" }
  } finally {
    clearTimeout(timeout)
  }
}

async function monitorCoreHealth(context: MonitorContext) {
  const checkedAt = context.now.toISOString()
  const redis = await checkRedisReadiness(undefined, 2_500)
  const ownerConfigured = Boolean(clean(context.env.AMS_OWNER_EMAIL))
  const internalAuth = isInternalApiConfigured()
  const stripeConfigured = Boolean(
    clean(context.env.STRIPE_SECRET_KEY) && clean(context.env.STRIPE_WEBHOOK_SECRET),
  )
  const r2Configured = isR2AssetStorageConfigured(context.env)
  const twitchRenderConfigured = isTwitchShortRenderConfigured(context.env)

  const critical: string[] = []
  const warnings: string[] = []

  if (redis.state !== "ready") critical.push(`Redis persistence is ${redis.state}.`)
  if (!ownerConfigured) critical.push("AMS_OWNER_EMAIL is not configured.")
  if (!internalAuth) critical.push("Internal API authentication is not configured.")
  if (!stripeConfigured) warnings.push("Stripe runtime or webhook configuration is incomplete.")
  if (!r2Configured) warnings.push("R2 asset storage is not configured; media import/storage will fail.")
  if (
    clean(context.env.AMS_TWITCH_SHORT_RENDER_ENABLED)?.toLowerCase() === "true" &&
    !twitchRenderConfigured
  ) {
    warnings.push("Twitch short rendering is enabled but its worker/storage configuration is incomplete.")
  }

  const status: BackendMonitorStatus = critical.length
    ? "critical"
    : warnings.length
      ? "warning"
      : "ok"

  return result(
    "core-health",
    "Core Infrastructure",
    status,
    status === "ok"
      ? "Core production dependencies are configured and Redis is reachable."
      : critical[0] ?? warnings[0],
    checkedAt,
    [...critical, ...warnings],
    {
      redis: redis.state,
      redisLatencyMs: redis.latencyMs,
      ownerConfigured,
      internalAuth,
      stripeConfigured,
      r2Configured,
      twitchRenderConfigured,
    },
  )
}

function parseStoredRecord(raw: unknown) {
  if (!raw) return null
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return null
    }
  }
  return typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null
}

async function monitorRevenueAndFulfillment(context: MonitorContext) {
  const checkedAt = context.now.toISOString()
  const secret = clean(context.env.STRIPE_SECRET_KEY)
  if (!secret) {
    return result(
      "revenue-fulfillment",
      "Revenue & Fulfillment",
      "not_configured",
      "Stripe is not configured for backend revenue monitoring.",
      checkedAt,
    )
  }

  const stripe = new Stripe(secret)
  const sinceCheckout = Math.floor(
    (context.now.getTime() - QUICK_AUDIT_WINDOW_HOURS * 60 * 60 * 1000) / 1000,
  )
  const sinceEvents = Math.floor(
    (context.now.getTime() - STRIPE_EVENT_WINDOW_HOURS * 60 * 60 * 1000) / 1000,
  )

  try {
    const [sessions, events] = await Promise.all([
      stripe.checkout.sessions.list({ limit: 100, created: { gte: sinceCheckout } }),
      stripe.events.list({
        limit: 100,
        created: { gte: sinceEvents },
        types: [
          "payment_intent.payment_failed",
          "checkout.session.async_payment_failed",
          "invoice.payment_failed",
        ],
      }),
    ])

    const quickAuditPaid = sessions.data.filter(
      (session) =>
        session.metadata?.offer === "ams_quick_marketing_audit" &&
        session.status === "complete" &&
        session.payment_status === "paid",
    )

    let fulfillmentMissing = 0
    const missingSessionIds: string[] = []
    if (context.redis) {
      for (const session of quickAuditPaid) {
        const record = parseStoredRecord(
          await context.redis.get<unknown>(`ams:quick-audit:session:${session.id}`),
        )
        if (record?.status !== "completed") {
          fulfillmentMissing += 1
          missingSessionIds.push(session.id)
        }
      }
    } else if (quickAuditPaid.length) {
      fulfillmentMissing = quickAuditPaid.length
      missingSessionIds.push(...quickAuditPaid.map((session) => session.id))
    }

    const failedPayments = events.data.length
    const status: BackendMonitorStatus =
      fulfillmentMissing > 0 ? "critical" : failedPayments > 0 ? "warning" : "ok"
    const details: string[] = []

    if (fulfillmentMissing) {
      details.push(
        `${fulfillmentMissing} paid Quick Audit checkout(s) do not have a completed fulfillment record.`,
      )
      details.push(...missingSessionIds.slice(0, 5).map((id) => `Unfulfilled checkout: ${id}`))
    }
    if (failedPayments) {
      details.push(`${failedPayments} recent Stripe payment failure event(s) require review.`)
    }

    return result(
      "revenue-fulfillment",
      "Revenue & Fulfillment",
      status,
      status === "ok"
        ? "No recent paid Quick Audit fulfillment gaps or payment failures were detected."
        : details[0],
      checkedAt,
      details,
      {
        quickAuditPaid: quickAuditPaid.length,
        fulfillmentMissing,
        failedPayments,
        windowHours: QUICK_AUDIT_WINDOW_HOURS,
      },
    )
  } catch {
    return result(
      "revenue-fulfillment",
      "Revenue & Fulfillment",
      "critical",
      "Stripe monitoring request failed.",
      checkedAt,
      ["The monitor could not verify recent payments or fulfillment state."],
    )
  }
}

async function monitorOvermindTasks(context: MonitorContext) {
  const checkedAt = context.now.toISOString()
  try {
    const tasks = await listOvermindTasks()
    const staleThreshold = STALE_TASK_HOURS * 60 * 60 * 1000
    const pending = tasks.filter((task) => task.status === "pending_approval")
    const stale = tasks.filter(
      (task) =>
        ["planned", "ready", "pending_approval", "approved"].includes(task.status) &&
        isStaleAt(task.updatedAt, context.now, staleThreshold),
    )
    const expiredApprovals = tasks.filter(
      (task) =>
        task.status === "approved" &&
        Boolean(task.approvalExpiresAt) &&
        Date.parse(task.approvalExpiresAt ?? "") <= context.now.getTime(),
    )

    const status: BackendMonitorStatus =
      expiredApprovals.length || stale.length ? "warning" : "ok"
    const details: string[] = []
    if (expiredApprovals.length) {
      details.push(`${expiredApprovals.length} approved Overmind task(s) have expired approval windows.`)
    }
    if (stale.length) {
      details.push(`${stale.length} active Overmind task(s) have been unchanged for at least ${STALE_TASK_HOURS} hours.`)
    }

    return result(
      "overmind-tasks",
      "Overmind Task Queue",
      status,
      status === "ok"
        ? "No stale or expired Overmind tasks were detected."
        : details[0],
      checkedAt,
      details,
      {
        total: tasks.length,
        pendingApproval: pending.length,
        stale: stale.length,
        expiredApprovals: expiredApprovals.length,
      },
    )
  } catch {
    return result(
      "overmind-tasks",
      "Overmind Task Queue",
      "critical",
      "Overmind task storage could not be read.",
      checkedAt,
    )
  }
}

async function monitorSocialPublishing(context: MonitorContext) {
  const checkedAt = context.now.toISOString()
  try {
    const campaigns = await listSocialCampaignRecords(50)
    const failed = campaigns.filter((campaign) =>
      ["failed", "partial"].includes(campaign.status),
    )
    const stuck = campaigns.filter(
      (campaign) =>
        campaign.status === "publishing" &&
        isStaleAt(
          campaign.updatedAt,
          context.now,
          STALE_PUBLISH_MINUTES * 60 * 1000,
        ),
    )
    const failedDeliveries = campaigns.flatMap((campaign) =>
      campaign.deliveries.filter((delivery) => delivery.status === "failed"),
    )

    const status: BackendMonitorStatus =
      stuck.length ? "critical" : failed.length || failedDeliveries.length ? "warning" : "ok"
    const details: string[] = []
    if (stuck.length) details.push(`${stuck.length} social campaign(s) appear stuck in publishing.`)
    if (failed.length) details.push(`${failed.length} campaign(s) are partial or failed.`)
    if (failedDeliveries.length) {
      details.push(`${failedDeliveries.length} individual channel delivery failure(s) were recorded.`)
    }

    return result(
      "social-publishing",
      "Social Publishing",
      status,
      status === "ok"
        ? "No stuck or failed social publishing jobs were detected."
        : details[0],
      checkedAt,
      details,
      {
        campaigns: campaigns.length,
        failedCampaigns: failed.length,
        stuckCampaigns: stuck.length,
        failedDeliveries: failedDeliveries.length,
      },
    )
  } catch {
    return result(
      "social-publishing",
      "Social Publishing",
      "warning",
      "Social campaign storage could not be read.",
      checkedAt,
    )
  }
}

async function monitorTwitchMedia(context: MonitorContext) {
  const checkedAt = context.now.toISOString()
  try {
    const [queue, jobs] = await Promise.all([
      getLatestTwitchMediaQueue(),
      listLatestTwitchShortRenderJobs(),
    ])
    const failedJobs = jobs.filter((job) => job.status === "failed")
    const stuckJobs = jobs.filter(
      (job) =>
        job.status === "rendering" &&
        isStaleAt(job.updatedAt, context.now, 60 * 60 * 1000),
    )
    const pendingOld = jobs.filter(
      (job) =>
        job.status === "pending" &&
        isStaleAt(job.updatedAt, context.now, 6 * 60 * 60 * 1000),
    )
    const discovered = queue?.items.filter((item) => item.status === "discovered") ?? []
    const r2Configured = isR2AssetStorageConfigured(context.env)

    const status: BackendMonitorStatus =
      stuckJobs.length > 0
        ? "critical"
        : failedJobs.length > 0 || pendingOld.length > 0 || !r2Configured
          ? "warning"
          : "ok"
    const details: string[] = []
    if (!r2Configured) details.push("R2 asset storage is not configured.")
    if (stuckJobs.length) details.push(`${stuckJobs.length} render job(s) appear stuck.`)
    if (failedJobs.length) details.push(`${failedJobs.length} recent render job(s) failed.`)
    if (pendingOld.length) details.push(`${pendingOld.length} render job(s) have been pending for over 6 hours.`)
    if (queue && !queue.mediaAuthorized) details.push("The latest Twitch media queue is not authorized for media access.")

    return result(
      "twitch-media",
      "Twitch Media & Rendering",
      status,
      status === "ok"
        ? "Twitch media storage and render queues show no active failure condition."
        : details[0],
      checkedAt,
      details,
      {
        queuePresent: Boolean(queue),
        mediaAuthorized: queue?.mediaAuthorized ?? false,
        clipsDiscovered: discovered.length,
        renderJobs: jobs.length,
        failedJobs: failedJobs.length,
        stuckJobs: stuckJobs.length,
        r2Configured,
      },
    )
  } catch {
    return result(
      "twitch-media",
      "Twitch Media & Rendering",
      "warning",
      "Twitch media monitoring could not read its current queue state.",
      checkedAt,
    )
  }
}

async function monitorFiverr(context: MonitorContext) {
  const checkedAt = context.now.toISOString()
  const operations = await listRecentFiverrOperations(25)
  const urgent = operations.filter((operation) => operation.priority === "urgent")
  const nearDeadline = operations.filter((operation) => {
    if (!operation.deadline_at) return false
    const deadline = Date.parse(operation.deadline_at)
    if (!Number.isFinite(deadline)) return false
    const remaining = deadline - context.now.getTime()
    return remaining >= 0 && remaining <= 24 * 60 * 60 * 1000
  })
  const actionable = operations.filter((operation) =>
    ["new_order", "requirements_received", "buyer_message", "revision_requested", "deadline_warning"].includes(
      operation.event_type,
    ),
  )

  const status: BackendMonitorStatus =
    urgent.length || nearDeadline.length ? "warning" : "ok"
  const details: string[] = []
  if (urgent.length) details.push(`${urgent.length} urgent Fiverr operation(s) require owner review.`)
  if (nearDeadline.length) details.push(`${nearDeadline.length} Fiverr deadline(s) are within 24 hours.`)

  return result(
    "fiverr-operations",
    "Fiverr Operations",
    status,
    status === "ok"
      ? "No urgent Fiverr deadlines or operations were detected in the backend queue."
      : details[0],
    checkedAt,
    details,
    {
      recentOperations: operations.length,
      actionable: actionable.length,
      urgent: urgent.length,
      nearDeadline: nearDeadline.length,
    },
  )
}

async function monitorAndroidPlay(context: MonitorContext) {
  const checkedAt = context.now.toISOString()
  const androidAgent = agents.find((agent) => agent.slug === "android-build-agent")
  const confirmed =
    clean(context.env.AMS_ANDROID_VERIFICATION_CONFIRMED)?.toLowerCase() === "true"
  const deadline = Date.parse(PLAY_VERIFICATION_DEADLINE)
  const remainingDays = Math.ceil(
    (deadline - context.now.getTime()) / (24 * 60 * 60 * 1000),
  )

  const details: string[] = []
  let status: BackendMonitorStatus = "ok"

  if (!confirmed && remainingDays <= 10) {
    status = remainingDays < 0 ? "critical" : "warning"
    details.push(
      remainingDays < 0
        ? "Android developer verification deadline has passed without backend confirmation."
        : `Android developer verification is not confirmed; ${remainingDays} day(s) remain until September 30, 2026.`,
    )
  }
  if (androidAgent?.status === "blocked") {
    if (status === "ok") status = "info"
    details.push(androidAgent.nextMilestone)
  }

  return result(
    "android-play",
    "Google Play Release",
    status,
    status === "ok"
      ? "No Google Play release gate is currently flagged by the backend."
      : details[0] ?? "Google Play release still has an open gate.",
    checkedAt,
    details,
    {
      catalogStatus: androidAgent?.status ?? "missing",
      verificationConfirmed: confirmed,
      verificationDaysRemaining: remainingDays,
    },
  )
}

async function monitorVisibility(context: MonitorContext) {
  const checkedAt = context.now.toISOString()
  const base =
    clean(context.env.NEXT_PUBLIC_APP_URL) ??
    clean(context.env.NEXTAUTH_URL) ??
    "https://www.aspectmarketingsolutions.app"
  const expectedLive = agents.filter((agent) => agent.status === "live" && !agent.internal).length
  const targets = [
    { key: "agents", url: `${base.replace(/\/$/u, "")}/agents` },
    { key: "pricing", url: `${base.replace(/\/$/u, "")}/pricing` },
    { key: "robots", url: `${base.replace(/\/$/u, "")}/robots.txt` },
    { key: "sitemap", url: `${base.replace(/\/$/u, "")}/sitemap.xml` },
  ]

  const fetched = await Promise.all(
    targets.map(async (target) => ({ ...target, ...(await fetchText(context.fetcher, target.url)) })),
  )
  const unavailable = fetched.filter((entry) => !entry.ok)
  const mismatches: string[] = []

  for (const entry of fetched.filter((item) => item.key === "agents" || item.key === "pricing")) {
    const counts = extractLiveAgentCountsFromText(entry.text)
    for (const count of counts) {
      if (count !== expectedLive) {
        mismatches.push(`${entry.key} page advertises ${count} Live agents; catalog truth is ${expectedLive}.`)
      }
    }
  }

  const status: BackendMonitorStatus = unavailable.length
    ? "critical"
    : mismatches.length
      ? "warning"
      : "ok"
  const details = [
    ...unavailable.map(
      (entry) => `${entry.key} returned ${entry.status ?? "network failure"}.`,
    ),
    ...mismatches,
  ]

  return result(
    "visibility-catalog",
    "Visibility & Catalog Truth",
    status,
    status === "ok"
      ? `Public AMS pages are reachable and no Live-agent count mismatch was detected; catalog truth is ${expectedLive}.`
      : details[0],
    checkedAt,
    details,
    {
      expectedLiveAgents: expectedLive,
      unavailablePages: unavailable.length,
      catalogMismatches: mismatches.length,
    },
  )
}

async function monitorExecutionTransparency(context: MonitorContext) {
  const checkedAt = context.now.toISOString()
  const contracts = listAgentContracts()
  const violations = contracts.filter((contract) => {
    const policy = contract.executionTransparency
    return (
      !contract.failClosed ||
      !contract.recordsAuditState ||
      !policy.discloseAiGeneration ||
      !policy.discloseAutomaticVerification ||
      !policy.discloseHumanReview ||
      !policy.discloseExternalProviders ||
      !policy.requireExplicitHumanConsent ||
      !policy.requireExplicitExternalProviderConsent ||
      !policy.persistConsentDecision
    )
  })

  return result(
    "execution-transparency",
    "Trust & Execution Transparency",
    violations.length ? "critical" : "ok",
    violations.length
      ? `${violations.length} agent contract(s) violate the AMS execution-transparency rule.`
      : `All ${contracts.length} registered agent contracts require execution disclosure, explicit human/third-party consent, and audit persistence.`,
    checkedAt,
    violations.map(
      (contract) =>
        `${contract.name}: execution-transparency controls are incomplete or not fail-closed.`,
    ),
    {
      registeredAgents: contracts.length,
      governedAgents: contracts.length - violations.length,
      violations: violations.length,
    },
  )
}

async function monitorAgentLifecycle(context: MonitorContext) {
  const checkedAt = context.now.toISOString()
  const counts = agents.reduce(
    (acc, agent) => {
      acc[agent.status] = (acc[agent.status] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )
  const liveCommercial = agents.filter(
    (agent) => agent.status === "live" && !agent.internal,
  ).length
  const blocked = agents.filter((agent) => agent.status === "blocked")

  return result(
    "agent-lifecycle",
    "Agent Lifecycle",
    blocked.length ? "info" : "ok",
    `${liveCommercial} commercial agents are Live; ${blocked.length} catalog agent(s) are blocked.`,
    checkedAt,
    blocked.map((agent) => `${agent.name}: ${agent.nextMilestone}`),
    {
      liveCommercial,
      liveTotal: counts.live ?? 0,
      beta: counts.beta ?? 0,
      setupRequired: counts["setup-required"] ?? 0,
      planned: counts.planned ?? 0,
      blocked: counts.blocked ?? 0,
    },
  )
}

async function runMonitorSafely(
  key: string,
  title: string,
  checkedAt: string,
  operation: () => Promise<BackendMonitorResult>,
) {
  try {
    return await operation()
  } catch {
    return result(
      key,
      title,
      "critical",
      "Monitor execution failed unexpectedly.",
      checkedAt,
    )
  }
}

function isAlertStatus(status: BackendMonitorStatus) {
  return status === "warning" || status === "critical"
}

function stateKey(monitorKey: string) {
  return `${MONITORING_PREFIX}:state:${monitorKey}`
}

function eventId(event: Omit<BackendMonitorEvent, "id">) {
  return sha(
    `${event.monitorKey}:${event.createdAt}:${event.fromStatus ?? "none"}:${event.toStatus}:${event.fingerprint}`,
  ).slice(0, 32)
}

async function persistSnapshot(
  snapshot: Omit<BackendMonitoringSnapshot, "newEvents">,
  redis: Redis | null,
): Promise<BackendMonitorEvent[]> {
  if (!redis) return []

  const newEvents: BackendMonitorEvent[] = []

  for (const current of snapshot.results) {
    const previousRaw = await redis.get<unknown>(stateKey(current.key))
    const previous = parseStoredRecord(previousRaw)
    const previousStatus =
      typeof previous?.status === "string"
        ? (previous.status as BackendMonitorStatus)
        : null
    const previousFingerprint =
      typeof previous?.fingerprint === "string" ? previous.fingerprint : null

    const changed =
      previousStatus !== current.status || previousFingerprint !== current.fingerprint
    const shouldEmit =
      changed &&
      (isAlertStatus(current.status) ||
        (previousStatus !== null && isAlertStatus(previousStatus)))

    if (shouldEmit) {
      const baseEvent: Omit<BackendMonitorEvent, "id"> = {
        monitorKey: current.key,
        monitorTitle: current.title,
        fromStatus: previousStatus,
        toStatus: current.status,
        summary: current.summary,
        details: current.details,
        createdAt: snapshot.checkedAt,
        fingerprint: current.fingerprint,
        recovery:
          previousStatus !== null &&
          isAlertStatus(previousStatus) &&
          !isAlertStatus(current.status),
      }
      const event: BackendMonitorEvent = { ...baseEvent, id: eventId(baseEvent) }
      newEvents.push(event)
      await redis.lpush(EVENT_INDEX_KEY, JSON.stringify(event))
      await redis.ltrim(EVENT_INDEX_KEY, 0, MAX_EVENTS - 1)
      await redis.expire(EVENT_INDEX_KEY, EVENT_TTL_SECONDS)
    }

    await redis.set(
      stateKey(current.key),
      JSON.stringify({
        status: current.status,
        fingerprint: current.fingerprint,
        checkedAt: current.checkedAt,
      }),
      { ex: EVENT_TTL_SECONDS },
    )
  }

  await redis.set(
    LATEST_KEY,
    JSON.stringify({ ...snapshot, newEvents }),
    { ex: EVENT_TTL_SECONDS },
  )

  return newEvents
}

async function dispatchAlertWebhook(
  events: BackendMonitorEvent[],
  env: NodeJS.ProcessEnv,
  fetcher: typeof fetch,
) {
  if (!events.length) return { configured: false, attempted: false, ok: true }

  const urlRaw = clean(env.AMS_MONITOR_ALERT_WEBHOOK_URL)
  const secret = clean(env.AMS_MONITOR_ALERT_WEBHOOK_SECRET)
  if (!urlRaw || !secret) return { configured: false, attempted: false, ok: true }

  let url: URL
  try {
    url = new URL(urlRaw)
  } catch {
    return { configured: true, attempted: false, ok: false }
  }
  if (url.protocol !== "https:") {
    return { configured: true, attempted: false, ok: false }
  }

  const body = JSON.stringify({
    source: "ams-backend-monitoring",
    createdAt: new Date().toISOString(),
    events,
  })
  const signature = createHmac("sha256", secret).update(body).digest("hex")
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetcher(url, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-AMS-Monitor-Signature": signature,
      },
      body,
    })
    return { configured: true, attempted: true, ok: response.ok }
  } catch {
    return { configured: true, attempted: true, ok: false }
  } finally {
    clearTimeout(timeout)
  }
}

export async function runBackendMonitoring(
  options: {
    now?: Date
    env?: NodeJS.ProcessEnv
    fetcher?: typeof fetch
    persist?: boolean
  } = {},
): Promise<BackendMonitoringSnapshot & { alertDelivery: { configured: boolean; attempted: boolean; ok: boolean } }> {
  const env = options.env ?? process.env
  const now = options.now ?? new Date()
  const fetcher = options.fetcher ?? fetch
  const checkedAt = now.toISOString()
  const redis = createRedis(env)
  const context: MonitorContext = { now, env, redis, fetcher }

  const results = await Promise.all([
    runMonitorSafely("core-health", "Core Infrastructure", checkedAt, () => monitorCoreHealth(context)),
    runMonitorSafely("revenue-fulfillment", "Revenue & Fulfillment", checkedAt, () => monitorRevenueAndFulfillment(context)),
    runMonitorSafely("overmind-tasks", "Overmind Task Queue", checkedAt, () => monitorOvermindTasks(context)),
    runMonitorSafely("social-publishing", "Social Publishing", checkedAt, () => monitorSocialPublishing(context)),
    runMonitorSafely("twitch-media", "Twitch Media & Rendering", checkedAt, () => monitorTwitchMedia(context)),
    runMonitorSafely("fiverr-operations", "Fiverr Operations", checkedAt, () => monitorFiverr(context)),
    runMonitorSafely("android-play", "Google Play Release", checkedAt, () => monitorAndroidPlay(context)),
    runMonitorSafely("visibility-catalog", "Visibility & Catalog Truth", checkedAt, () => monitorVisibility(context)),
    runMonitorSafely("execution-transparency", "Trust & Execution Transparency", checkedAt, () => monitorExecutionTransparency(context)),
    runMonitorSafely("agent-lifecycle", "Agent Lifecycle", checkedAt, () => monitorAgentLifecycle(context)),
  ])

  const base: Omit<BackendMonitoringSnapshot, "newEvents"> = {
    version: "backend-monitoring-v1",
    checkedAt,
    overallStatus: worstStatus(results),
    results,
  }

  const newEvents = options.persist === false ? [] : await persistSnapshot(base, redis)
  const alertDelivery = await dispatchAlertWebhook(newEvents, env, fetcher)

  return { ...base, newEvents, alertDelivery }
}

export async function getBackendMonitoringSnapshot(
  env: NodeJS.ProcessEnv = process.env,
): Promise<BackendMonitoringSnapshot | null> {
  const redis = createRedis(env)
  if (!redis) return null
  return parseStoredRecord(await redis.get<unknown>(LATEST_KEY)) as BackendMonitoringSnapshot | null
}

export async function listBackendMonitorEvents(
  limit = 50,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BackendMonitorEvent[]> {
  const redis = createRedis(env)
  if (!redis) return []
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)))
  const rows = await redis.lrange<unknown>(EVENT_INDEX_KEY, 0, safeLimit - 1)
  return rows
    .map((row) => parseStoredRecord(row))
    .filter((row): row is BackendMonitorEvent => Boolean(row?.monitorKey && row?.toStatus))
}

export function authorizeMonitoringCron(
  authorization: string | null,
  env: NodeJS.ProcessEnv = process.env,
) {
  const expected = clean(env.CRON_SECRET)
  if (!expected || !authorization?.startsWith("Bearer ")) return false
  const supplied = authorization.slice("Bearer ".length).trim()
  const left = Uint8Array.from(createHash("sha256").update(supplied).digest())
  const right = Uint8Array.from(createHash("sha256").update(expected).digest())
  return timingSafeEqual(left, right)
}
