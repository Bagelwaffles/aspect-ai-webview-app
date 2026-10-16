import { createHash } from "node:crypto"

import { Redis } from "@upstash/redis"

import type { BackendMonitorEvent } from "@/lib/server/backend-monitoring"

const PREFIX = "ams:maintenance:v1"
const INDEX = PREFIX + ":index"
const RETENTION_SECONDS = 60 * 60 * 24 * 90
const MAX_FINDINGS = 250
const MAX_AGE_MS = 48 * 60 * 60 * 1000
const REPO = "Bagelwaffles/aspect-ai-webview-app"

export type MaintenanceState = "observed" | "draft_pr" | "checks_passed" | "blocked"
export type MaintenanceOrigin = "backend" | "owner_research"
export type MaintenanceFinding = {
  id: string
  origin: MaintenanceOrigin
  category: "repair" | "update"
  area: string
  summary: string
  evidenceUrl: string | null
  sourceFingerprint: string
  sourceObservedAt: string
  createdAt: string
  updatedAt: string
  severity: "warning" | "critical" | "opportunity"
  confidence: "unverified" | "monitor_signal"
  businessImpact: string
  estimatedCostUsd: number | null
  policy: "draft_only" | "escalate"
  state: MaintenanceState
  pr: { url: string; headSha: string; verifiedAt: string; ciVerifiedAt: string | null } | null
  history: Array<{ at: string; state: MaintenanceState; note: string }>
}

export type MaintenanceInput = {
  origin: MaintenanceOrigin
  category: MaintenanceFinding["category"]
  area: string
  summary: string
  sourceFingerprint: string
  sourceObservedAt: string
  severity: MaintenanceFinding["severity"]
  evidenceUrl?: string | null
  businessImpact?: string
  estimatedCostUsd?: number | null
}

export type MaintenanceRedis = {
  get<T = unknown>(key: string): Promise<T | null>
  set(key: string, value: string, options?: { nx?: boolean; ex?: number }): Promise<unknown>
  lpush(key: string, ...values: string[]): Promise<unknown>
  ltrim(key: string, start: number, stop: number): Promise<unknown>
  lrange<T = unknown>(key: string, start: number, stop: number): Promise<T[]>
}

export type MaintenanceOptions = {
  redis?: MaintenanceRedis | null
  env?: NodeJS.ProcessEnv
  now?: Date
}

function clean(value: string, max: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, max)
}

function validUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const parsed = new URL(value)
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      ? parsed.href.slice(0, 800)
      : null
  } catch {
    return null
  }
}

function hash(input: string) {
  return createHash("sha256").update(input).digest("hex")
}

function redisFrom(options: MaintenanceOptions): MaintenanceRedis {
  if (Object.prototype.hasOwnProperty.call(options, "redis")) {
    if (!options.redis) throw new Error("MAINTENANCE_STORE_UNAVAILABLE")
    return options.redis
  }
  const env = options.env ?? process.env
  const url = (env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL)?.trim()
  const token = (env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN)?.trim()
  if (!url || !token) throw new Error("MAINTENANCE_STORE_UNAVAILABLE")
  return new Redis({ url, token })
}

function key(id: string) {
  return PREFIX + ":finding:" + id
}

export function maintenanceActionPolicy(
  action: string,
  estimatedCostUsd: number | null = 0,
): { eligible: boolean; ownerApprovalRequired: boolean; reason: string } {
  if (estimatedCostUsd === null || !Number.isFinite(estimatedCostUsd) || estimatedCostUsd > 0 || estimatedCostUsd < 0) {
    return { eligible: false, ownerApprovalRequired: true, reason: "Cost is unknown or nonzero." }
  }
  if (action === "read" || action === "research" || action === "draft_pr") {
    return { eligible: true, ownerApprovalRequired: action === "draft_pr", reason: "Restricted to read or isolated Draft PR; no release." }
  }
  const ownerOnly = new Set([
    "production_deploy", "pr_merge", "payment", "billing", "credentials",
    "permissions", "customer_data", "delete", "public_publish", "android_release",
    "paid_api", "outbound_message", "feature_flag",
  ])
  return {
    eligible: false,
    ownerApprovalRequired: true,
    reason: ownerOnly.has(action) ? "Owner-authorized consequential action." : "Unrecognized action fails closed.",
  }
}

export function normalizeMaintenanceInput(
  input: MaintenanceInput,
  now = new Date(),
): MaintenanceFinding {
  const observed = Date.parse(input.sourceObservedAt)
  if (!Number.isFinite(observed) || observed > now.getTime() + 5 * 60_000 ||
      now.getTime() - observed > MAX_AGE_MS) {
    throw new Error("MAINTENANCE_STALE_OR_FUTURE_SIGNAL")
  }
  const area = clean(input.area, 100)
  const summary = clean(input.summary, 600)
  const fingerprint = clean(input.sourceFingerprint, 256)
  if (!area || !summary || !fingerprint) throw new Error("MAINTENANCE_INVALID_FINDING")
  if (!["backend", "owner_research"].includes(input.origin) ||
      !["repair", "update"].includes(input.category) ||
      !["warning", "critical", "opportunity"].includes(input.severity)) {
    throw new Error("MAINTENANCE_INVALID_FINDING")
  }
  const amount = input.estimatedCostUsd ?? null
  if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000)) {
    throw new Error("MAINTENANCE_INVALID_COST")
  }
  const policy = input.origin === "backend" &&
    !["revenue-fulfillment", "android-play", "core-health"].includes(area) ? "draft_only" : "escalate"
  const createdAt = now.toISOString()
  // Stable across repeats and re-emitted monitor events, with no private data in the key.
  const id = hash([input.origin, input.category, area, fingerprint, input.severity].join("\u0000")).slice(0, 40)
  return {
    id, origin: input.origin, category: input.category, area, summary,
    evidenceUrl: validUrl(input.evidenceUrl),
    sourceFingerprint: fingerprint,
    sourceObservedAt: new Date(observed).toISOString(),
    createdAt, updatedAt: createdAt,
    severity: input.severity,
    confidence: input.origin === "backend" ? "monitor_signal" : "unverified",
    businessImpact: clean(input.businessImpact ?? "Needs impact assessment and reproduction.", 300),
    estimatedCostUsd: amount,
    policy, state: "observed", pr: null,
    history: [{ at: createdAt, state: "observed", note: "Signal recorded; no change executed." }],
  }
}

export function fromBackendMonitorEvent(
  event: BackendMonitorEvent,
  now = new Date(),
): MaintenanceFinding | null {
  if (event.recovery || (event.toStatus !== "warning" && event.toStatus !== "critical")) return null
  return normalizeMaintenanceInput({
    origin: "backend",
    category: "repair",
    area: event.monitorKey,
    summary: event.summary,
    sourceFingerprint: event.fingerprint,
    sourceObservedAt: event.createdAt,
    severity: event.toStatus,
    estimatedCostUsd: null,
    businessImpact: "Operational signal requiring verification before any repair.",
  }, now)
}

function parsed(raw: unknown): MaintenanceFinding | null {
  try {
    const record = typeof raw === "string" ? JSON.parse(raw) : raw
    if (!record || typeof record !== "object" || !/^[a-f0-9]{40}$/u.test((record as MaintenanceFinding).id)) {
      return null
    }
    return record as MaintenanceFinding
  } catch {
    return null
  }
}

export async function recordMaintenanceFinding(
  finding: MaintenanceFinding,
  options: MaintenanceOptions = {},
): Promise<{ finding: MaintenanceFinding; new: boolean }> {
  const redis = redisFrom(options)
  const created = await redis.set(key(finding.id), JSON.stringify(finding), { nx: true, ex: RETENTION_SECONDS })
  if (created) {
    await redis.lpush(INDEX, finding.id)
    await redis.ltrim(INDEX, 0, MAX_FINDINGS - 1)
    return { finding, new: true }
  }
  const existing = parsed(await redis.get<unknown>(key(finding.id)))
  if (!existing) throw new Error("MAINTENANCE_FINDING_CONFLICT")
  return { finding: existing, new: false }
}

export async function ingestBackendMonitorEvents(
  events: BackendMonitorEvent[],
  options: MaintenanceOptions = {},
): Promise<{ ingested: number; duplicates: number; ignored: number }> {
  let ingested = 0
  let duplicates = 0
  let ignored = 0
  for (const event of events.slice(0, 100)) {
    const finding = fromBackendMonitorEvent(event, options.now ?? new Date())
    if (!finding) {
      ignored++
      continue
    }
    const recorded = await recordMaintenanceFinding(finding, options)
    if (recorded.new) ingested++
    else duplicates++
  }
  return { ingested, duplicates, ignored }
}

export async function listMaintenanceFindings(limit = 50, options: MaintenanceOptions = {}) {
  const redis = redisFrom(options)
  const ids = await redis.lrange<string>(INDEX, 0, Math.max(1, Math.min(100, limit)) - 1)
  const results: MaintenanceFinding[] = []
  for (const id of new Set(ids)) {
    const record = parsed(await redis.get<unknown>(key(String(id))))
    if (record) results.push(record)
  }
  return results
}

export async function getMaintenanceFinding(id: string, options: MaintenanceOptions = {}) {
  if (!/^[a-f0-9]{40}$/u.test(id)) return null
  return parsed(await redisFrom(options).get<unknown>(key(id)))
}

// This records an independently verified GitHub draft PR. It never merges or deploys.
export async function recordDraftPr(
  id: string,
  pr: { url: string; headSha: string },
  options: MaintenanceOptions = {},
) {
  const redis = redisFrom(options)
  const existing = await getMaintenanceFinding(id, { ...options, redis })
  if (!existing) throw new Error("MAINTENANCE_FINDING_NOT_FOUND")
  const urlPattern = /^https:\/\/github\.com\/Bagelwaffles\/aspect-ai-webview-app\/pull\/([1-9]\d*)\/?$/u
  if (!urlPattern.test(pr.url) || !/^[a-f0-9]{40}$/u.test(pr.headSha)) {
    throw new Error("MAINTENANCE_PR_PROOF_INVALID")
  }
  if (existing.pr && (existing.pr.url !== pr.url || existing.pr.headSha !== pr.headSha)) {
    throw new Error("MAINTENANCE_PR_CONFLICT")
  }
  if (existing.state !== "observed" && existing.state !== "draft_pr") {
    throw new Error("MAINTENANCE_STATE_INVALID")
  }
  const at = (options.now ?? new Date()).toISOString()
  const next: MaintenanceFinding = {
    ...existing, state: "draft_pr", updatedAt: at,
    pr: existing.pr ?? { url: pr.url, headSha: pr.headSha, verifiedAt: at, ciVerifiedAt: null },
    history: existing.pr ? existing.history :
      [...existing.history.slice(-19), { at, state: "draft_pr", note: "GitHub draft PR independently verified; not merged." }],
  }
  await redis.set(key(id), JSON.stringify(next), { ex: RETENTION_SECONDS })
  return next
}

export async function markChecksPassed(id: string, headSha: string, options: MaintenanceOptions = {}) {
  const redis = redisFrom(options)
  const existing = await getMaintenanceFinding(id, { ...options, redis })
  if (!existing || !existing.pr || existing.pr.headSha !== headSha ||
      (existing.state !== "draft_pr" && existing.state !== "checks_passed")) {
    throw new Error("MAINTENANCE_CHECKS_PROOF_INVALID")
  }
  if (existing.state === "checks_passed") return existing
  const at = (options.now ?? new Date()).toISOString()
  const next: MaintenanceFinding = {
    ...existing, state: "checks_passed", updatedAt: at,
    pr: { ...existing.pr, ciVerifiedAt: at },
    history: [...existing.history.slice(-19),
      { at, state: "checks_passed", note: "Required GitHub checks independently verified; release not authorized." }],
  }
  await redis.set(key(id), JSON.stringify(next), { ex: RETENTION_SECONDS })
  return next
}

export const maintenanceRepository = REPO
