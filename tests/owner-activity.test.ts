import assert from "node:assert/strict"
import test from "node:test"
import { createHash } from "node:crypto"
import { ACTIVITY_STATUSES, parseReport, parseStoredReport, reportContentKey, type ActivityUpdate } from "../lib/operations/reporting"
import { activitySinceMarker, advanceActivityFreshness, projectApproval, projectOwnerActivity, type HostApprovalObservation } from "../lib/operations/owner-activity"
import { readSpecialistReports, saveSpecialistReport, REPORT_PREFIX, REPORTING_PREVIEW_BRANCH, type ReportingRedis } from "../lib/server/operations-report-store"
import { activityFixture, activityInput, activityNow, activityReport, approvalFixture, telemetryFixture } from "./fixtures/owner-activity"
import { NextRequest } from "next/server"
import { handleReportingPost } from "../lib/server/operations-report-api"

const binding = { specialistId: "engineering" as const, sourceSystemId: "owner-reviewed-specialist:engineering" }
function valid(input: unknown) { return parseReport(input, binding, activityNow).ok }
const terminal = { completedAt: "2026-11-12T11:00:00.000Z", result: "Source-only review finished", changeSummary: "No live action taken", toolStatus: "SUCCEEDED" as const }
function hostFixture(overrides: Partial<HostApprovalObservation> = {}): HostApprovalObservation {
  return { source: "verified_host_result", confirmed: true, specialistId: "engineering", activityId: "layout-review", scope: approvalFixture(), state: "APPROVED", observedAt: "2026-11-12T11:00:00.000Z", ...overrides }
}

test("version 2 activity uses the existing envelope while version 1 stays readable", () => {
  assert.equal(valid(activityInput()), true)
  const report = activityReport()
  const { activity, ...legacy } = report
  assert.ok(activity)
  assert.equal(parseStoredReport({ ...legacy, schemaVersion: 1 }, binding, activityNow).ok, true)
  assert.equal(parseStoredReport(report, binding, activityNow).ok, true)
  assert.equal(valid({ ...activityInput(), activity: undefined }), false)
  assert.equal(valid({ ...activityInput(), schemaVersion: 1 }), false)
  assert.equal(valid({ ...activityInput(), hostApproval: hostFixture() }), false)
})

test("all normalized task statuses have explicit validated representations", () => {
  for (const taskStatus of ACTIVITY_STATUSES) {
    const activity: Partial<ActivityUpdate> = { taskStatus }
    if (["COMPLETED", "NO_CHANGE"].includes(taskStatus)) Object.assign(activity, terminal)
    if (["BLOCKED", "FAILED"].includes(taskStatus)) activity.blocker = "Original operation did not finish"
    if (taskStatus === "AWAITING_OWNER") activity.ownerActionRequired = true
    if (["APPROVAL_PENDING", "APPROVAL_UNKNOWN"].includes(taskStatus)) activity.approval = approvalFixture({ reportedOutcome: taskStatus === "APPROVAL_UNKNOWN" ? "unknown" : "pending" })
    assert.equal(valid(activityInput(activity)), true, taskStatus)
  }
})

test("completion and no-change need terminal evidence, time and owner review", () => {
  for (const taskStatus of ["COMPLETED", "NO_CHANGE"] as const) {
    for (const activity of [{ completedAt: null }, { result: "" }, { changeSummary: "" }, { toolStatus: "UNKNOWN" as const }, { toolStatus: "RUNNING" as const }, { toolStatus: "FAILED" as const }]) assert.equal(valid(activityInput({ taskStatus, ...terminal, ...activity })), false)
    for (const report of [{ evidence: [] }, { verification: "unverified" as const }]) assert.equal(valid(activityInput({ taskStatus, ...terminal }, report)), false)
    const item = projectOwnerActivity(telemetryFixture([activityReport({ taskStatus, ...terminal })])).current[0]
    assert.equal(item.status, taskStatus)
    assert.equal(item.deploymentStatus, "UNKNOWN")
    assert.equal(item.releaseStatus, "UNKNOWN")
    assert.equal(item.approval.mayExecute, false)
  }
})

test("running work needs a checkpoint and blocked/failed work needs recovery", () => {
  assert.equal(valid(activityInput({ nextCheckpoint: "" })), false)
  assert.equal(valid(activityInput({ taskStatus: "AWAITING_OWNER", ownerActionRequired: false })), false)
  for (const taskStatus of ["BLOCKED", "FAILED"] as const) {
    assert.equal(valid(activityInput({ taskStatus, blocker: "", recovery: "Review source" })), false)
    assert.equal(valid(activityInput({ taskStatus, blocker: "Transport ended", recovery: "" })), false)
  }
})

test("activity fields reject extra authority, private text, unsafe URLs and inconsistent timestamps", () => {
  for (const change of [{ approved: true }, { title: "customer_id: private-value" }, { actor: "owner@example.org" }, { activityId: "task-private" }, { updatedAt: "2026-11-13T00:00:00.000Z" }, { updatedAt: "2026-11-12T11:45:00.000Z" }, { startedAt: "2026-11-12T11:15:00.000Z" }, { completedAt: "2026-11-12T10:00:00.000Z" }]) assert.equal(valid({ ...activityInput(), activity: { ...activityFixture(), ...change } }), false)
  for (const change of [{ approved: true }, { site: "https://chatgpt.com/c/private" }, { site: "https://example.org/review?token=value" }, { dataExposure: "password: private" }, { permissionType: "always_allow" }, { requestedAt: "2026-11-12T11:15:00.000Z" }]) assert.equal(valid({ ...activityInput(), approvalState: "requested", activity: { ...activityFixture(), approval: { ...approvalFixture(), ...change } } }), false)
  assert.equal(valid(activityInput({ approval: approvalFixture() }, { approvalState: "none" })), false)
})

test("imported approved/denied/pending claims never manufacture host confirmation", () => {
  for (const reportedOutcome of ["approved", "denied", "pending", "unknown"] as const) {
    const model = projectOwnerActivity(telemetryFixture([activityReport({ taskStatus: "APPROVAL_PENDING", approval: approvalFixture({ reportedOutcome }) })]))
    assert.equal(model.current[0].status, "APPROVAL_UNKNOWN")
    assert.equal(model.current[0].approval.status, "UNKNOWN")
    assert.equal(model.current[0].approval.hostVerified, false)
    assert.equal(model.mayExecute, false)
    assert.equal(model.hostApprovalTransportVerified, false)
  }
})

test("a trusted host observation can display only its exact matching scope without granting execution", () => {
  for (const state of ["PENDING", "UNKNOWN", "APPROVED", "DENIED"] as const) {
    const result = projectApproval(approvalFixture(), "engineering", "layout-review", activityNow, hostFixture({ state }))
    assert.equal(result.status, state)
    assert.equal(result.hostVerified, true)
    assert.equal(result.mayExecute, false)
  }
  for (const change of [{ confirmed: false }, { source: "owner_import" }, { specialistId: "finance" }, { activityId: "another" }, { observedAt: "2026-11-10T10:00:00.000Z" }, { observedAt: "2026-11-13T00:00:00.000Z" }]) assert.equal(projectApproval(approvalFixture(), "engineering", "layout-review", activityNow, { ...hostFixture(), ...change } as HostApprovalObservation).status, "UNKNOWN")
  for (const scope of [approvalFixture({ permissionType: "recurring" }), approvalFixture({ targetEnvironment: "production" }), approvalFixture({ dataExposure: "Different data" }), approvalFixture({ requestedAction: "Different action" })]) assert.equal(projectApproval(approvalFixture(), "engineering", "layout-review", activityNow, hostFixture({ scope })).status, "UNKNOWN")
  const report = activityReport({ taskStatus: "APPROVAL_PENDING", approval: approvalFixture() })
  const model = projectOwnerActivity(telemetryFixture([report]), [hostFixture()])
  assert.equal(model.current[0].approval.status, "APPROVED")
  assert.equal(model.current[0].status, "UNAVAILABLE", "A confirmed permission does not establish a subsequent task result")
  assert.equal(model.current[0].releaseStatus, "UNKNOWN")
})

test("stale source and old activity cannot be refreshed by a recent receipt", () => {
  const report = activityReport({ updatedAt: "2026-11-01T11:00:00.000Z", startedAt: null })
  assert.equal(report.receivedAt, activityNow.toISOString())
  assert.equal(projectOwnerActivity(telemetryFixture([report])).current[0].status, "STALE")
  const fresh = projectOwnerActivity(telemetryFixture([activityReport()]))
  assert.equal(advanceActivityFreshness(fresh, new Date("2026-11-14T11:00:00.000Z")).current[0].status, "STALE")
})

test("unknown tool outcome remains distinct from a known failure", () => {
  const unknown = projectOwnerActivity(telemetryFixture([activityReport({ toolStatus: "UNKNOWN" })])).current[0]
  assert.equal(unknown.status, "UNAVAILABLE")
  assert.match(unknown.blocker, /Tool result unknown/)
  const failed = projectOwnerActivity(telemetryFixture([activityReport({ taskStatus: "FAILED", toolStatus: "FAILED", blocker: "Operation returned failure", recovery: "Review failure evidence before another attempt" })])).current[0]
  assert.equal(failed.status, "FAILED")
  assert.equal(failed.toolStatus, "FAILED")
})

test("timeline deduplicates identities and repeated transitions without losing changed checkpoints", () => {
  const first = activityReport()
  const repeated = activityReport({}, { reportId: "activity-update-2", dedupeKey: "activity-update-2", evidence: first.evidence.map(({ url, label, provenance }) => ({ provenance, label, url })) })
  const changed = activityReport({ nextCheckpoint: "Report the final review result", updatedAt: "2026-11-12T11:15:00.000Z" }, { reportId: "activity-update-3", dedupeKey: "activity-update-3" })
  const model = projectOwnerActivity(telemetryFixture([first, first, repeated, changed]))
  assert.equal(model.current.length, 1)
  assert.equal(model.current[0].nextCheckpoint, changed.activity!.nextCheckpoint)
  assert.equal(model.events.length, 2)
  assert.equal(model.events[0].observedAt, changed.activity!.updatedAt)
  const conflict = { ...first, summary: "Conflicting fixture" }
  assert.equal(projectOwnerActivity(telemetryFixture([first, conflict])).current[0].status, "UNAVAILABLE")
})

test("legacy reports cannot invent task completion but retain explicit owner-review requests", () => {
  const { activity, ...report } = activityReport()
  assert.ok(activity)
  const legacy = { ...report, schemaVersion: 1 as const, status: "healthy" as const }
  assert.equal(projectOwnerActivity(telemetryFixture([legacy])).current[0].status, "UNAVAILABLE")
  const requested = projectOwnerActivity(telemetryFixture([{ ...legacy, approvalState: "requested" }])).current[0]
  assert.equal(requested.status, "AWAITING_OWNER")
  assert.equal(requested.approval.status, "UNKNOWN")
  assert.equal(requested.approval.request, null)
})

test("monitor recovery and passed Draft checks are not completed tasks or release evidence", () => {
  const data = telemetryFixture()
  data.monitoring.snapshot = { state: "available", checkedAt: data.checkedAt, error: null, data: { observedAt: data.checkedAt, rows: [{ key: "core-health", name: "Core", observedAt: data.checkedAt, reportedStatus: "ok", status: "unknown" }, { key: "agent-lifecycle", name: "Lifecycle", observedAt: data.checkedAt, reportedStatus: "warning", status: "attention" }] } }
  const event = { id: "synthetic-monitor-event", monitorKey: "core-health", toStatus: "ok" as const, createdAt: data.checkedAt, recovery: true }
  data.monitoring.events.data = [event, event]
  data.maintenance.data = [{ id: "a".repeat(40), area: "engineering", state: "checks_passed", sourceObservedAt: data.checkedAt, updatedAt: data.checkedAt, policy: "escalate", pr: { url: "https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/280", headSha: "b".repeat(40), ciVerifiedAt: data.checkedAt } }]
  const model = projectOwnerActivity(data)
  assert.equal(model.events.length, 1)
  assert.equal(model.events[0].status, "UNAVAILABLE")
  assert.ok(model.current.every(item => !["COMPLETED", "NO_CHANGE"].includes(item.status)))
  assert.ok(model.current.some(item => item.status === "BLOCKED"))
  assert.ok(model.current.every(item => item.releaseStatus === "UNKNOWN"))
  data.monitoring.snapshot.state = "unavailable"
  data.monitoring.events.state = "unavailable"
  data.maintenance.state = "unavailable"
  const unavailable = projectOwnerActivity(data)
  assert.equal(unavailable.current.length, 0)
  assert.equal(unavailable.events.length, 0)
  assert.equal(unavailable.sources.monitors, "unavailable")
})

test("local read markers count newly received old reports without making their evidence fresh", () => {
  const report = activityReport({ updatedAt: "2026-11-01T11:00:00.000Z", startedAt: null })
  const model = projectOwnerActivity(telemetryFixture([report]))
  assert.equal(activitySinceMarker(model.events, "2026-11-12T11:00:00.000Z", activityNow), 1)
  assert.equal(activitySinceMarker(model.events, activityNow.toISOString(), activityNow), 0)
  assert.equal(activitySinceMarker(model.events, "invalid", activityNow), 1)
  assert.equal(activitySinceMarker(model.events, "2099-01-01T00:00:00.000Z", activityNow), 1)
  assert.equal(model.events[0].status, "STALE")
})

test("version 2 uses the existing report keys, immutable content hash and mixed-version reader", async () => {
  const env = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: REPORTING_PREVIEW_BRANCH, UPSTASH_REDIS_REST_URL: "https://accepted-quetzal-206056.upstash.io", UPSTASH_REDIS_REST_TOKEN: "synthetic-test-only" } as unknown as NodeJS.ProcessEnv
  const report = activityReport()
  const stored = JSON.stringify({ report, contentHash: createHash("sha256").update(reportContentKey(report)).digest("hex") })
  const keys: string[][] = []
  const redis: ReportingRedis = { get: async () => null, lrange: async <T>(key: string) => (key === `${REPORT_PREFIX}:engineering:history` ? [stored] : []) as T[], eval: async (_script, actualKeys) => { keys.push(actualKeys); return ["duplicate", stored] } }
  const saved = await saveSpecialistReport("engineering", activityInput(), { env, now: activityNow, redis })
  assert.equal(saved.created, false)
  assert.deepEqual(saved.report.activity, report.activity)
  assert.equal(keys[0].length, 4)
  assert.ok(keys[0].every(key => key.startsWith(`${REPORT_PREFIX}:engineering:`)))
  const read = await readSpecialistReports({ env, now: activityNow, redis })
  assert.equal(read.state, "available")
  assert.deepEqual(read.data, [report])
  assert.notEqual(reportContentKey(report), reportContentKey({ ...report, activity: { ...report.activity!, nextCheckpoint: "Changed next step" } }))
})

test("version 2 cannot bypass the owner, trusted-origin or exact Preview gate", async () => {
  const env = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: REPORTING_PREVIEW_BRANCH, VERCEL_GIT_COMMIT_SHA: "a".repeat(40) } as unknown as NodeJS.ProcessEnv
  const request = () => new NextRequest("https://preview.example.org/api/internal/operations/reports", { method: "POST", headers: { origin: "https://preview.example.org", "content-type": "application/json" }, body: JSON.stringify({ specialistId: "engineering", reviewedAgainstRepoSha: env.VERCEL_GIT_COMMIT_SHA, attestations: { publicOnly: true, noSensitiveData: true, sourceReviewed: true }, report: activityInput() }) })
  const save = async (): Promise<never> => assert.fail("Denied activity must not persist")
  assert.equal((await handleReportingPost(request(), { env, save, authorize: async () => ({ ok: false, status: 401, code: "OWNER_SESSION_REQUIRED" }) })).status, 401)
  assert.equal((await handleReportingPost(request(), { env, save, authorize: async (_request, options) => { assert.equal(options?.requireTrustedOrigin, true); return { ok: false, status: 403, code: "UNTRUSTED_ORIGIN" } } })).status, 403)
  assert.equal((await handleReportingPost(request(), { env: { ...env, VERCEL_ENV: "production" }, save, authorize: async (): Promise<never> => assert.fail("Production must reject before auth") })).status, 404)
})
