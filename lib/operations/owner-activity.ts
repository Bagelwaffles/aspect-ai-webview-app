import { SPECIALISTS, projectReport, reportContentKey, type ActivityStatus, type ApprovalRequestReport, type ReportEnvelope, type ReportEvidence, type SpecialistId } from "./reporting"
import type { getOperationsTelemetry } from "../server/operations-telemetry"

export type HostApprovalObservation = {
  /** Reserved server-side adapter input. No current host adapter populates this. */
  source: "verified_host_result"
  confirmed: true
  specialistId: SpecialistId
  activityId: string
  scope: ApprovalRequestReport
  state: "PENDING" | "UNKNOWN" | "APPROVED" | "DENIED"
  observedAt: string
}
export type ApprovalDisplay = {
  status: "NONE" | "PENDING" | "UNKNOWN" | "APPROVED" | "DENIED"
  request: ApprovalRequestReport | null
  observedAt: string | null
  hostVerified: boolean
  reason: string
  mayExecute: false
}
export type OwnerActivityItem = {
  id: string
  activityKey: string
  kind: "specialist" | "monitor" | "maintenance"
  title: string
  actor: string
  source: string
  status: ActivityStatus
  reportedStatus: string
  observedAt: string | null
  receivedAt: string | null
  expiresAt: string | null
  startedAt: string | null
  completedAt: string | null
  summary: string
  nextCheckpoint: string
  lastSuccessfulStep: string
  result: string
  blocker: string
  recovery: string
  changeSummary: string
  ownerActionRequired: boolean | null
  toolStatus: string
  approval: ApprovalDisplay
  evidence: ReportEvidence[]
  verification: string
  deploymentStatus: "UNKNOWN"
  releaseStatus: "UNKNOWN"
}
export type OwnerActivityModel = {
  checkedAt: string
  current: OwnerActivityItem[]
  events: OwnerActivityItem[]
  sources: { reports: string; monitors: string; monitorEvents: string; maintenance: string }
  automaticTransportVerified: false
  hostApprovalTransportVerified: false
  mayExecute: false
}
const HOUR = 3_600_000
const emptyApproval = (): ApprovalDisplay => ({ status: "NONE", request: null, observedAt: null, hostVerified: false, reason: "No approval request reported; this is not proof no external request exists.", mayExecute: false })
function validTime(value: string, now: Date) {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && parsed <= now.getTime() && new Date(parsed).toISOString() === value
}
function scopeKey(scope: ApprovalRequestReport) {
  return JSON.stringify([scope.requestKey, scope.requestedAt, scope.requestedAction, scope.capability, scope.tool, scope.site, scope.targetEnvironment, scope.reason, scope.riskImpact, scope.dataExposure, scope.duration, scope.permissionType])
}
/** Display only. Imported approval claims and UI clicks can never populate the trusted host input. */
export function projectApproval(request: ApprovalRequestReport | null, specialistId: SpecialistId, activityId: string, now: Date, host: HostApprovalObservation | undefined): ApprovalDisplay {
  if (!request) return emptyApproval()
  const matches = host?.source === "verified_host_result" && host.confirmed === true && host.specialistId === specialistId && host.activityId === activityId && host.scope && scopeKey(host.scope) === scopeKey(request)
  const fresh = host && validTime(host.observedAt, now) && Date.parse(host.observedAt) >= Date.parse(request.requestedAt) && now.getTime() - Date.parse(host.observedAt) < 48 * HOUR
  if (!matches || !fresh || !["PENDING", "UNKNOWN", "APPROVED", "DENIED"].includes(host.state)) {
    return { status: "UNKNOWN", request, observedAt: null, hostVerified: false, reason: "Host result unavailable or not reconciled. Imported text, a click or dismissal does not confirm permission. Use the original host request; do not resend or broaden access.", mayExecute: false }
  }
  return { status: host.state, request, observedAt: host.observedAt, hostVerified: true, reason: "Matching host result observed for this exact scope. Historical display only; this dashboard grants no authority and cannot execute the action.", mayExecute: false }
}
function baseItem(id: string, kind: OwnerActivityItem["kind"], title: string): OwnerActivityItem {
  return { id, activityKey: id, kind, title, actor: "Unknown", source: "Unavailable", status: "UNAVAILABLE", reportedStatus: "Unknown", observedAt: null, receivedAt: null, expiresAt: null, startedAt: null, completedAt: null, summary: "", nextCheckpoint: "Not reported", lastSuccessfulStep: "Not reported", result: "Not reported", blocker: "Not reported", recovery: "Inspect the original source; no automatic retry.", changeSummary: "Not reported", ownerActionRequired: null, toolStatus: "NOT_REPORTED", approval: emptyApproval(), evidence: [], verification: "Not verified", deploymentStatus: "UNKNOWN", releaseStatus: "UNKNOWN" }
}
function specialistItem(report: ReportEnvelope, now: Date, hosts: readonly HostApprovalObservation[]): OwnerActivityItem {
  const source = SPECIALISTS.find(item => item.id === report.specialistId)!
  const activity = report.activity
  const item = baseItem(`report:${report.specialistId}:${report.reportId}`, "specialist", activity?.title ?? `${source.name}: activity not reported`)
  item.actor = activity?.actor ?? source.name
  item.source = `${source.name} · manual owner-reviewed report`
  item.observedAt = activity?.updatedAt ?? report.observedAt
  item.receivedAt = report.receivedAt
  item.summary = report.summary
  item.evidence = report.evidence
  item.verification = `${report.verification.replaceAll("_", " ")} · ${report.confidence} confidence; source authenticity not machine-verified`
  item.reportedStatus = activity?.taskStatus ?? `Legacy health signal: ${report.status}; task outcome not supplied`
  item.activityKey = `specialist:${report.specialistId}:${activity?.activityId ?? "legacy"}`
  if (!activity) {
    item.blocker = "This version 1 report does not establish task activity, completion or host approval state."
    item.nextCheckpoint = "Import an owner-reviewed version 2 activity update when available."
    item.expiresAt = projectReport(report, now).expiresAt
    if (report.approvalState === "requested") {
      item.status = "AWAITING_OWNER"
      item.ownerActionRequired = true
      item.nextCheckpoint = report.nextAction || "Review the original request and its exact scope."
      item.approval = { ...emptyApproval(), status: "UNKNOWN", reason: "Legacy report requests owner review but supplies no permission scope or host result. Review the original request; no approval is established." }
    }
    if (item.expiresAt && now.getTime() >= Date.parse(item.expiresAt)) item.status = "STALE"
    return item
  }
  const reportProjection = projectReport(report, now)
  item.expiresAt = new Date(Math.min(Date.parse(reportProjection.expiresAt!), Date.parse(activity.updatedAt) + source.ttlMs)).toISOString()
  Object.assign(item, {
    status: activity.taskStatus, startedAt: activity.startedAt, completedAt: activity.completedAt,
    nextCheckpoint: activity.nextCheckpoint || "Not reported", lastSuccessfulStep: activity.lastSuccessfulStep || "Not reported",
    result: activity.result || "Not reported", blocker: activity.blocker || "None reported; not independently verified",
    recovery: activity.recovery || "No recovery step reported", changeSummary: activity.changeSummary || "Not reported",
    ownerActionRequired: activity.ownerActionRequired, toolStatus: activity.toolStatus,
  })
  const host = hosts.filter(h => h.specialistId === report.specialistId && h.activityId === activity.activityId && h.scope.requestKey === activity.approval?.requestKey).sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0]
  item.approval = projectApproval(activity.approval, report.specialistId, activity.activityId, now, host)
  if (["APPROVAL_PENDING", "APPROVAL_UNKNOWN"].includes(activity.taskStatus)) {
    item.status = item.approval.status === "PENDING" ? "APPROVAL_PENDING" : item.approval.status === "UNKNOWN" ? "APPROVAL_UNKNOWN" : "UNAVAILABLE"
    if (["APPROVED", "DENIED"].includes(item.approval.status)) item.blocker = "Host result observed; the subsequent task outcome is unavailable. No action or completion is inferred."
  }
  if (activity.toolStatus === "UNKNOWN") { item.status = "UNAVAILABLE"; item.blocker = "Tool result unknown. Reconcile the original operation before another action." }
  if (now.getTime() >= Date.parse(item.expiresAt)) item.status = "STALE"
  return item
}
function order(a: OwnerActivityItem, b: OwnerActivityItem) {
  return Date.parse(b.observedAt ?? "1970-01-01") - Date.parse(a.observedAt ?? "1970-01-01") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}
function transitionKey(item: OwnerActivityItem) {
  return JSON.stringify([item.activityKey, item.title, item.actor, item.reportedStatus, item.summary, item.startedAt, item.completedAt, item.nextCheckpoint, item.lastSuccessfulStep, item.result, item.blocker, item.recovery, item.changeSummary, item.ownerActionRequired, item.toolStatus, item.approval.request ? [scopeKey(item.approval.request), item.approval.request.reportedOutcome] : null, item.evidence.map(evidence => [evidence.url, evidence.label, evidence.provenance])])
}
type Telemetry = Awaited<ReturnType<typeof getOperationsTelemetry>>
/** Reuses retained reports, monitor events and maintenance findings. No extra datastore or reads. */
export function projectOwnerActivity(data: Telemetry, hosts: readonly HostApprovalObservation[] = [], now = new Date(data.checkedAt)): OwnerActivityModel {
  const history: OwnerActivityItem[] = []
  const current = new Map<string, OwnerActivityItem>()
  const reportRows = data.reports.state === "available" ? data.reports.data ?? [] : []
  const uniqueReports = new Map<string, ReportEnvelope>()
  const conflicting = new Set<string>()
  for (const report of reportRows) {
    const key = `${report.specialistId}:${report.reportId}`
    const prior = uniqueReports.get(key)
    if (prior && (reportContentKey(prior) !== reportContentKey(report) || prior.receivedAt !== report.receivedAt)) conflicting.add(key)
    else uniqueReports.set(key, report)
  }
  const items = [...uniqueReports.entries()].map(([key, report]) => {
    const item = specialistItem(report, now, hosts)
    if (conflicting.has(key)) { item.status = "UNAVAILABLE"; item.blocker = "Conflicting retained activity identity; no outcome can be established."; item.approval = emptyApproval() }
    return item
  }).sort(order)
  // Collapse adjacent identical reports for a task, retaining actual status/detail transitions.
  const lastTransition = new Map<string, string>()
  for (const item of items) {
    if (!current.has(item.activityKey)) current.set(item.activityKey, item)
    const key = transitionKey(item)
    if (lastTransition.get(item.activityKey) !== key) history.push(item)
    lastTransition.set(item.activityKey, key)
  }
  for (const row of data.monitoring.snapshot.state === "available" ? data.monitoring.snapshot.data?.rows ?? [] : []) {
    const item = baseItem(`monitor:${row.key}`, "monitor", row.name)
    item.actor = "Existing backend monitor"
    item.source = "Saved monitor snapshot; no monitor execution triggered"
    item.observedAt = row.observedAt
    item.expiresAt = row.observedAt ? new Date(Date.parse(row.observedAt) + 48 * HOUR).toISOString() : null
    item.reportedStatus = row.reportedStatus ?? "Unknown"
    item.status = row.status === "stale" ? "STALE" : ["blocked", "attention"].includes(row.status) ? "BLOCKED" : "UNAVAILABLE"
    item.summary = "Monitor signal only. A configuration check does not establish an active task, completed repair or permission."
    item.blocker = item.status === "BLOCKED" ? "Saved monitor warning needs source review; repair outcome is not established." : "Current end-to-end outcome unavailable."
    item.verification = "Minimized saved monitor evidence"
    current.set(item.activityKey, item)
  }
  const monitorIds = new Map<string, string>()
  for (const event of data.monitoring.events.state === "available" ? data.monitoring.events.data ?? [] : []) {
    const item = baseItem(`monitor-event:${event.id}`, "monitor", `${event.monitorKey} stored change`)
    const prior = monitorIds.get(item.id)
    const value = JSON.stringify(event)
    if (prior === value) continue
    monitorIds.set(item.id, value)
    item.actor = "Existing backend monitor"
    item.source = "Stored monitor event"
    item.observedAt = event.createdAt
    item.expiresAt = new Date(Date.parse(event.createdAt) + 48 * HOUR).toISOString()
    item.reportedStatus = event.toStatus
    item.status = now.getTime() >= Date.parse(item.expiresAt) ? "STALE" : ["warning", "critical"].includes(event.toStatus) ? "BLOCKED" : "UNAVAILABLE"
    item.summary = event.recovery ? "Recorded recovery signal, not verified task completion." : "Recorded monitor status transition."
    item.changeSummary = `Monitor reported ${event.toStatus}`
    if (prior) { item.status = "UNAVAILABLE"; item.blocker = "Conflicting stored event identity."; const at = history.findIndex(row => row.id === item.id); if (at >= 0) history.splice(at, 1) }
    history.push(item)
  }
  for (const finding of data.maintenance.state === "available" ? data.maintenance.data ?? [] : []) {
    const item = baseItem(`finding:${finding.id}`, "maintenance", `Existing finding ${finding.id.slice(0, 10)}`)
    item.actor = "Existing maintenance pipeline"
    item.source = "Saved maintenance finding"
    item.observedAt = finding.sourceObservedAt
    item.expiresAt = new Date(Date.parse(finding.sourceObservedAt) + 48 * HOUR).toISOString()
    item.reportedStatus = finding.state
    item.status = now.getTime() >= Date.parse(item.expiresAt) ? "STALE" : finding.state === "blocked" ? "BLOCKED" : "UNAVAILABLE"
    item.summary = "Finding and Draft PR evidence are separate from deployment, release and task completion."
    item.changeSummary = `Recorded finding state: ${finding.state}`
    if (finding.pr) item.evidence = [{ url: finding.pr.url, label: `Draft PR at ${finding.pr.headSha.slice(0, 12)}`, provenance: "Saved finding reference, not a fresh GitHub check" }]
    current.set(item.activityKey, item)
  }
  return { checkedAt: data.checkedAt, current: [...current.values()].sort(order), events: history.sort(order).slice(0, 250), sources: { reports: data.reports.state, monitors: data.monitoring.snapshot.state, monitorEvents: data.monitoring.events.state, maintenance: data.maintenance.state }, automaticTransportVerified: false, hostApprovalTransportVerified: false, mayExecute: false }
}
export function advanceActivityFreshness(model: OwnerActivityModel, now: Date): OwnerActivityModel {
  const advance = (item: OwnerActivityItem): OwnerActivityItem => {
    const expired = item.expiresAt && now.getTime() >= Date.parse(item.expiresAt)
    const approval = item.approval.hostVerified && item.approval.observedAt && now.getTime() - Date.parse(item.approval.observedAt) >= 48 * HOUR
      ? { ...item.approval, status: "UNKNOWN" as const, hostVerified: false, reason: "Host observation expired; reconcile the original request. No authority granted." }
      : item.approval
    const status = expired ? "STALE" : item.status === "APPROVAL_PENDING" && approval.status !== "PENDING" ? "APPROVAL_UNKNOWN" : item.status
    return { ...item, status, approval }
  }
  return { ...model, current: model.current.map(advance), events: model.events.map(advance) }
}
/** A local read marker is presentation only and cannot change reports or approval state. */
export function activitySinceMarker(events: readonly OwnerActivityItem[], marker: string | null, now: Date) {
  if (!marker || !validTime(marker, now)) return events.length
  return events.filter(event => Date.parse(event.receivedAt ?? event.observedAt ?? "1970-01-01") > Date.parse(marker)).length
}
