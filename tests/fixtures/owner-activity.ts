import { parseReport, projectSpecialists, type ActivityUpdate, type ApprovalRequestReport, type ReportEnvelope, type ReportInput } from "../../lib/operations/reporting"
import type { getOperationsTelemetry } from "../../lib/server/operations-telemetry"

export const activityNow = new Date("2026-11-12T12:00:00.000Z")
export function approvalFixture(overrides: Partial<ApprovalRequestReport> = {}): ApprovalRequestReport {
  return { requestKey: "preview-layout-review", requestedAt: "2026-11-12T10:00:00.000Z", requestedAction: "Inspect the Preview layout once", capability: "Read rendered layout at a narrow width", tool: "Existing browser", site: "https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/280", targetEnvironment: "preview", reason: "Verify responsive layout", riskImpact: "Read-only inspection; no report submission", dataExposure: "Sanitized synthetic reporting fixture only", duration: "This single layout inspection", permissionType: "one_time", reportedOutcome: "pending", ...overrides }
}
export function activityFixture(overrides: Partial<ActivityUpdate> = {}): ActivityUpdate {
  return { activityId: "layout-review", title: "Review Preview layout", actor: "Engineering", taskStatus: "IN_PROGRESS", startedAt: "2026-11-12T09:00:00.000Z", updatedAt: "2026-11-12T11:00:00.000Z", completedAt: null, nextCheckpoint: "Report the layout evidence or exact blocker", lastSuccessfulStep: "Source review completed", result: "", blocker: "", recovery: "Reconcile the original request before another attempt", changeSummary: "Local source review started", ownerActionRequired: false, toolStatus: "NOT_REPORTED", approval: null, ...overrides }
}
export function activityInput(activity: Partial<ActivityUpdate> = {}, report: Partial<ReportInput> = {}): ReportInput {
  return { schemaVersion: 2, reportId: "activity-update-1", dedupeKey: "activity-update-1", specialistId: "engineering", sourceSystem: { id: "owner-reviewed-specialist:engineering", version: "2" }, observedAt: "2026-11-12T11:30:00.000Z", sourceLastRunAt: "2026-11-12T11:30:00.000Z", status: "unknown", summary: "Synthetic owner activity fixture, not live service evidence.", currentWork: "Review activity reporting", blocker: "", nextAction: "Review local evidence", evidence: [{ url: "https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/280", label: "Public Draft reference", provenance: "Synthetic fixture reference reviewed locally" }], confidence: "low", verification: "owner_attested", approvalState: activity.approval ? "requested" : "none", activity: activityFixture(activity), ...report }
}
export function activityReport(activity: Partial<ActivityUpdate> = {}, report: Partial<ReportInput> = {}, now = activityNow): ReportEnvelope {
  const parsed = parseReport(activityInput(activity, report), { specialistId: "engineering", sourceSystemId: "owner-reviewed-specialist:engineering" }, now)
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed.report
}
export function telemetryFixture(reports: ReportEnvelope[] = []): Awaited<ReturnType<typeof getOperationsTelemetry>> {
  const checkedAt = activityNow.toISOString()
  return { checkedAt, reports: { state: "available", data: reports, checkedAt, error: null }, specialists: projectSpecialists(reports, activityNow), monitoring: { snapshot: { state: "unknown", data: null, checkedAt, error: "No saved snapshot" }, events: { state: "available", data: [], checkedAt, error: null } }, maintenance: { state: "available", data: [], checkedAt, error: null } }
}
