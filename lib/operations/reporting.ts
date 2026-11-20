/** Inert, minimized reporting data only. This module never executes source text or grants authority. */
const DAY = 24 * 60 * 60 * 1000
export const SPECIALISTS = [
  { id: "engineering", name: "Engineering & Release", responsibility: "Delivery, reliability, tests, and technical risks", ttlMs: 2 * DAY },
  { id: "compliance", name: "Google & Compliance", responsibility: "Policy, privacy, and compliance review", ttlMs: 8 * DAY },
  { id: "revenue", name: "Revenue & Funnel", responsibility: "Revenue operations and commercial blockers", ttlMs: 2 * DAY },
  { id: "growth", name: "Growth & Competitive Intelligence", responsibility: "Acquisition, campaigns, and growth experiments", ttlMs: 2 * DAY },
  { id: "customer-experience", name: "Customer Experience & Support", responsibility: "Support quality and customer experience", ttlMs: 2 * DAY },
  { id: "finance", name: "Finance & Unit Economics", responsibility: "Financial operations and reconciliation review", ttlMs: 8 * DAY },
  { id: "creator", name: "Creator Automation", responsibility: "Content readiness and creator workflows", ttlMs: 2 * DAY },
  { id: "commerce", name: "Merch & Commerce", responsibility: "Store readiness, catalog, and fulfillment review", ttlMs: 8 * DAY },
] as const
// Daily sources expire after 48h; weekly compliance/finance/commerce sources after eight days.
export type SpecialistId = typeof SPECIALISTS[number]["id"]
export type ReportStatus = "healthy" | "attention" | "blocked" | "unknown" | "stale"
export type ReportEvidence = { url: string; label: string; provenance: string }
export const ACTIVITY_STATUSES = ["IN_PROGRESS", "COMPLETED", "BLOCKED", "AWAITING_OWNER", "APPROVAL_PENDING", "APPROVAL_UNKNOWN", "FAILED", "NO_CHANGE", "STALE", "UNAVAILABLE"] as const
export type ActivityStatus = typeof ACTIVITY_STATUSES[number]
export type ApprovalRequestReport = {
  requestKey: string
  requestedAt: string
  requestedAction: string
  capability: string
  tool: string
  site: string | null
  targetEnvironment: "preview" | "production" | "external" | "unknown"
  reason: string
  riskImpact: string
  dataExposure: string
  duration: string
  permissionType: "one_time" | "recurring"
  /** An imported claim, never a confirmed host result or permission grant. */
  reportedOutcome: "pending" | "unknown" | "approved" | "denied"
}
export type ActivityUpdate = {
  /** Public-safe correlation label, not a private platform task or request ID. */
  activityId: string
  title: string
  actor: string
  taskStatus: ActivityStatus
  startedAt: string | null
  updatedAt: string
  completedAt: string | null
  nextCheckpoint: string
  lastSuccessfulStep: string
  result: string
  blocker: string
  recovery: string
  changeSummary: string
  ownerActionRequired: boolean
  toolStatus: "NOT_REPORTED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "UNKNOWN"
  approval: ApprovalRequestReport | null
}
export type ReportEnvelope = {
  schemaVersion: 1 | 2
  reportId: string
  dedupeKey: string
  specialistId: SpecialistId
  sourceSystem: { id: string; version: string }
  observedAt: string
  sourceLastRunAt: string
  receivedAt: string
  status: ReportStatus
  summary: string
  currentWork: string
  blocker: string
  nextAction: string
  evidence: ReportEvidence[]
  confidence: "low" | "medium" | "high"
  verification: "owner_attested" | "unverified"
  approvalState: "none" | "requested"
  /** Version 2 only; validated as part of the same immutable report and store. */
  activity?: ActivityUpdate
}
export type ReportInput = Omit<ReportEnvelope, "receivedAt">
/** Supplied by trusted adapter configuration, never copied out of a report payload. */
export type SourceBinding = { specialistId: SpecialistId; sourceSystemId: string }
export type ReportReadResult =
  | { state: "available"; reports: ReportEnvelope[] }
  | { state: "not_configured"; reason: string }
  | { state: "unavailable"; reason: string }
  | { state: "unknown"; reason: string }
export type ReportProjection = {
  specialistId: SpecialistId
  status: ReportStatus
  freshness: "fresh" | "stale" | "unknown"
  oldestObservationAt: string | null
  expiresAt: string | null
  report: ReportEnvelope | null
}
const STATUSES = ["healthy", "attention", "blocked", "unknown", "stale"]
const INPUT_KEYS = ["schemaVersion", "reportId", "dedupeKey", "specialistId", "sourceSystem", "observedAt", "sourceLastRunAt", "status", "summary", "currentWork", "blocker", "nextAction", "evidence", "confidence", "verification", "approvalState"]
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
}
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/
function safeId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value) && !/^(?:sk[-_]|gh[pousr]_|AKIA)|(?:^|[:._-])(?:task|thread|session)(?:$|[:._-])/i.test(value)
}
// Defense in depth, not exhaustive PII detection. Adapters must minimize before submitting.
const UNSAFE_TEXT = /(?:[\u0000-\u001f\u007f<>]|https?:\/\/|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:sk[-_][a-z0-9_-]{10,}|gh[pousr]_[a-z0-9]{10,}|AKIA[A-Z0-9]{16})\b|-----BEGIN|\b(?:password|api[_ -]?key|access[_ -]?token|private[_ -]?key|bearer)\s*[:= ]|\b(?:ignore|override|disregard)\b.{0,40}\b(?:instructions?|rules?|prompts?)\b|\b(?:system|developer)\s*(?:prompt|message)|\b(?:execute|eval)\s*\(|\b(?:task|thread|session)[_-]?id\s*[:=]|\b(?:account|routing|card|customer|invoice)[_ -]?(?:number|id)\s*[:=]|\b\d[\d ()+-]{7,}\d\b)/i
function safeText(value: unknown, max: number, required = false): value is string {
  return typeof value === "string" && value.length <= max && (!required || value.trim().length > 0) && !UNSAFE_TEXT.test(value)
}
/** Links are display-only. No network fetch is performed. Query/userinfo are prohibited; recognized public GitHub evidence anchors are allowed. */
export function isPublicEvidenceUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 512 || /[\s\\]/.test(value)) return false
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    if (url.protocol !== "https:" || url.username || url.password || url.search || (url.port && url.port !== "443")) return false
    if (/(?:^|\.)(?:chatgpt\.com|chatgpt-team\.site|nip\.io|sslip\.io|localtest\.me)$/.test(host)) return false
    if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host)) return false
    if (/(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion|lan|home|corp)$/.test(host)) return false
    if (["chatgpt.com", "chat.openai.com"].includes(host)) return false
    const githubEvidence = host === "github.com" && /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(?:issues\/\d+|pull\/\d+|actions\/runs\/\d+|commit\/[a-f0-9]{40})(?:\/)?$/.test(url.pathname)
    if (url.hash && !(githubEvidence && /^#(?:issuecomment-|discussion_r|pullrequestreview-)\d+$/.test(url.hash))) return false
    // No private conversations, raw credentials, contact identifiers, or encoded bypasses in paths.
    const path = decodeURIComponent(url.pathname)
    if ((!githubEvidence && UNSAFE_TEXT.test(path)) || /[%@]|\b(?:tasks?|threads?|sessions?|token|secret|password|credentials)\b/i.test(path)) return false
    return true
  } catch { return false }
}
function timestamp(value: unknown, now: number): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false
  const time = Date.parse(value)
  return Number.isFinite(time) && time <= now && new Date(time).toISOString() === value
}
const ACTIVITY_KEYS = ["activityId", "title", "actor", "taskStatus", "startedAt", "updatedAt", "completedAt", "nextCheckpoint", "lastSuccessfulStep", "result", "blocker", "recovery", "changeSummary", "ownerActionRequired", "toolStatus", "approval"]
const APPROVAL_KEYS = ["requestKey", "requestedAt", "requestedAction", "capability", "tool", "site", "targetEnvironment", "reason", "riskImpact", "dataExposure", "duration", "permissionType", "reportedOutcome"]
function validActivity(value: unknown, report: Record<string, unknown>, now: number): value is ActivityUpdate {
  if (!object(value) || !exactKeys(value, ACTIVITY_KEYS) || !safeId(value.activityId) || !safeText(value.title, 120, true) || !safeText(value.actor, 80, true)) return false
  if (!ACTIVITY_STATUSES.includes(value.taskStatus as ActivityStatus) || !timestamp(value.updatedAt, now) || Date.parse(value.updatedAt) > Date.parse(report.observedAt as string)) return false
  for (const key of ["startedAt", "completedAt"]) if (value[key] !== null && (!timestamp(value[key], now) || Date.parse(value[key] as string) > Date.parse(value.updatedAt))) return false
  if (value.startedAt && value.completedAt && Date.parse(value.startedAt as string) > Date.parse(value.completedAt as string)) return false
  for (const key of ["nextCheckpoint", "lastSuccessfulStep", "result", "blocker", "recovery", "changeSummary"]) if (!safeText(value[key], 500)) return false
  if (typeof value.ownerActionRequired !== "boolean" || !["NOT_REPORTED", "RUNNING", "SUCCEEDED", "FAILED", "UNKNOWN"].includes(value.toolStatus as string)) return false
  const terminal = value.taskStatus === "COMPLETED" || value.taskStatus === "NO_CHANGE"
  if (terminal && (!value.completedAt || !value.result || !value.changeSummary || report.verification !== "owner_attested" || !Array.isArray(report.evidence) || report.evidence.length === 0 || ["RUNNING", "FAILED", "UNKNOWN"].includes(value.toolStatus as string))) return false
  if (!terminal && value.taskStatus !== "FAILED" && value.completedAt !== null) return false
  if (value.taskStatus === "IN_PROGRESS" && !value.nextCheckpoint) return false
  if (["BLOCKED", "FAILED"].includes(value.taskStatus as string) && (!value.blocker || !value.recovery)) return false
  if (value.taskStatus === "AWAITING_OWNER" && (!value.ownerActionRequired || !value.nextCheckpoint)) return false
  if (value.approval === null) return !["APPROVAL_PENDING", "APPROVAL_UNKNOWN"].includes(value.taskStatus as string)
  const approval = value.approval
  if (!object(approval) || !exactKeys(approval, APPROVAL_KEYS) || !safeId(approval.requestKey) || !timestamp(approval.requestedAt, now) || Date.parse(approval.requestedAt) > Date.parse(value.updatedAt)) return false
  for (const key of ["requestedAction", "capability", "tool", "reason", "riskImpact", "dataExposure", "duration"]) if (!safeText(approval[key], 280, true)) return false
  if (approval.site !== null && !isPublicEvidenceUrl(approval.site)) return false
  return ["preview", "production", "external", "unknown"].includes(approval.targetEnvironment as string) && ["one_time", "recurring"].includes(approval.permissionType as string) && ["pending", "unknown", "approved", "denied"].includes(approval.reportedOutcome as string) && report.approvalState === "requested"
}
export function parseReport(input: unknown, binding: SourceBinding, now = new Date()): { ok: true; report: ReportEnvelope } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error })
  if (!Number.isFinite(now.getTime())) return fail("Invalid server time")
  if (!object(input) || !exactKeys(input, input.schemaVersion === 2 ? [...INPUT_KEYS, "activity"] : INPUT_KEYS)) return fail("Invalid report fields")
  if (input.schemaVersion !== 1 && input.schemaVersion !== 2) return fail("Unsupported report version")
  if (!SPECIALISTS.some(item => item.id === binding.specialistId) || input.specialistId !== binding.specialistId) return fail("Specialist binding mismatch")
  if (!object(input.sourceSystem) || !exactKeys(input.sourceSystem, ["id", "version"]) || !safeId(input.sourceSystem.id) || input.sourceSystem.id !== binding.sourceSystemId || !safeId(input.sourceSystem.version)) return fail("Source binding mismatch")
  if (!safeId(input.reportId) || !safeId(input.dedupeKey)) return fail("Invalid report identity")
  if (!timestamp(input.observedAt, now.getTime()) || !timestamp(input.sourceLastRunAt, now.getTime())) return fail("Invalid observation timestamp")
  if (typeof input.status !== "string" || !STATUSES.includes(input.status) || !["low", "medium", "high"].includes(input.confidence as string) || !["owner_attested", "unverified"].includes(input.verification as string) || !["none", "requested"].includes(input.approvalState as string)) return fail("Invalid reporting state")
  if (!safeText(input.summary, 500, true) || !safeText(input.currentWork, 500) || !safeText(input.blocker, 500) || !safeText(input.nextAction, 500)) return fail("Unsafe or oversized report text")
  if (!Array.isArray(input.evidence) || input.evidence.length > 5 || !input.evidence.every(item => object(item) && exactKeys(item, ["url", "label", "provenance"]) && isPublicEvidenceUrl(item.url) && safeText(item.label, 120, true) && safeText(item.provenance, 160, true))) return fail("Invalid public evidence")
  if (input.schemaVersion === 2 && !validActivity(input.activity, input, now.getTime())) return fail("Invalid activity report")
  // Copy through serialization so callers cannot mutate a validated nested object afterward.
  return { ok: true, report: { ...JSON.parse(JSON.stringify(input)), receivedAt: now.toISOString() } as ReportEnvelope }
}
/** Stored receipt time remains immutable. Malformed storage must fail the entire read. */
export function parseStoredReport(input: unknown, binding: SourceBinding, now = new Date()): { ok: true; report: ReportEnvelope } | { ok: false; error: string } {
  if (!object(input) || !exactKeys(input, [...INPUT_KEYS, ...(input.schemaVersion === 2 ? ["activity"] : []), "receivedAt"]) || !timestamp(input.receivedAt, now.getTime())) return { ok: false, error: "Invalid stored receipt" }
  const { receivedAt, ...payload } = input
  return parseReport(payload, binding, new Date(receivedAt))
}
export function projectReport(report: ReportEnvelope, now = new Date()): ReportProjection {
  const specialist = SPECIALISTS.find(item => item.id === report.specialistId)
  const oldest = Math.min(Date.parse(report.observedAt), Date.parse(report.sourceLastRunAt))
  const valid = !!specialist && Number.isFinite(oldest) && Number.isFinite(now.getTime()) && timestamp(report.observedAt, now.getTime()) && timestamp(report.sourceLastRunAt, now.getTime()) && timestamp(report.receivedAt, now.getTime())
  if (!valid) return { specialistId: report.specialistId, status: "unknown", freshness: "unknown", oldestObservationAt: null, expiresAt: null, report }
  const expires = oldest + specialist.ttlMs
  const stale = now.getTime() >= expires
  const status = stale ? "stale" : report.status === "healthy" && (report.verification !== "owner_attested" || report.evidence.length === 0) ? "unknown" : report.status
  return { specialistId: report.specialistId, status, freshness: stale ? "stale" : "fresh", oldestObservationAt: new Date(oldest).toISOString(), expiresAt: new Date(expires).toISOString(), report }
}
/** Canonical semantic content, deliberately excluding server receipt time. Not an authentication token. */
export function reportContentKey(report: ReportEnvelope): string {
  function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical)
    if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    return value
  }
  const content = { ...report } as Partial<ReportEnvelope>
  delete content.receivedAt
  return JSON.stringify(canonical(content))
}
export function compareReportIdentity(a: ReportEnvelope, b: ReportEnvelope): "duplicate" | "conflict" | "distinct" {
  if (a.specialistId !== b.specialistId || a.sourceSystem.id !== b.sourceSystem.id) return "distinct"
  if (a.reportId !== b.reportId && a.dedupeKey !== b.dedupeKey) return "distinct"
  return reportContentKey(a) === reportContentKey(b) ? "duplicate" : "conflict"
}
/** Bounded newest-observation-first history. A newly received old report cannot replace newer evidence. */
export function projectHistory(reports: readonly ReportEnvelope[], now = new Date(), limit = 20): ReportProjection[] {
  const bounded = Number.isFinite(limit) ? Math.max(0, Math.min(100, Math.floor(limit))) : 20
  return [...reports].sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt) || (a.reportId < b.reportId ? -1 : a.reportId > b.reportId ? 1 : 0)).slice(0, bounded).map(report => projectReport(report, now))
}
export function projectSpecialists(reports: readonly ReportEnvelope[], now = new Date()): ReportProjection[] {
  return SPECIALISTS.map(specialist => projectHistory(reports.filter(report => report.specialistId === specialist.id), now, 1)[0] ?? { specialistId: specialist.id, status: "unknown", freshness: "unknown", oldestObservationAt: null, expiresAt: null, report: null })
}
