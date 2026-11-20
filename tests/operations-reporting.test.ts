import assert from "node:assert/strict"
import test from "node:test"
import { SPECIALISTS, parseReport, parseStoredReport, projectReport, projectHistory, projectSpecialists, reportContentKey, compareReportIdentity, isPublicEvidenceUrl, type ReportInput, type SourceBinding } from "../lib/operations/reporting"

const now = new Date("2026-11-12T12:00:00.000Z")
const binding: SourceBinding = { specialistId: "engineering", sourceSystemId: "owner-reviewed-specialist:engineering" }
function input(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    schemaVersion: 1, reportId: "engineering-build-42", dedupeKey: "build-42", specialistId: "engineering",
    sourceSystem: { id: binding.sourceSystemId, version: "1" },
    observedAt: "2026-11-12T10:00:00.000Z", sourceLastRunAt: "2026-11-12T11:00:00.000Z",
    status: "healthy", summary: "Preview checks passed.", currentWork: "Review reporting bridge", blocker: "", nextAction: "Owner review",
    evidence: [{ url: "https://github.com/acme/project/pull/42", label: "Preview review", provenance: "Owner reviewed public pull request" }],
    confidence: "high", verification: "owner_attested", approvalState: "none", ...overrides,
  }
}
function report(overrides: Partial<ReportInput> = {}) {
  const result = parseReport(input(overrides), binding, now)
  if (!result.ok) throw new Error(result.error)
  assert.equal(result.ok, true)
  return result.report
}

test("eight fixed lanes use daily or weekly freshness policy and missing reports stay unknown", () => {
  assert.deepEqual(SPECIALISTS.map(s => s.id), ["engineering", "compliance", "revenue", "growth", "customer-experience", "finance", "creator", "commerce"])
  assert.equal(new Set(SPECIALISTS.map(s => s.name)).size, 8)
  assert.ok(SPECIALISTS.every(s => s.responsibility && s.ttlMs === (["compliance", "finance", "commerce"].includes(s.id) ? 8 : 2) * 86400000))
  assert.equal(projectSpecialists([], now).length, 8)
  assert.ok(projectSpecialists([], now).every(s => s.status === "unknown" && s.report === null))
})
test("strict envelope accepts bounded inert reports and assigns receipt only on server", () => {
  const original = input()
  const result = parseReport(original, binding, now)
  assert.ok(result.ok)
  if (!result.ok) return
  assert.equal(result.report.receivedAt, now.toISOString())
  original.evidence[0].label = "Changed after parse"
  assert.equal(result.report.evidence[0].label, "Preview review")
  for (const extra of [{ receivedAt: now.toISOString() }, { rawPrompt: "secret" }, { taskId: "private" }]) assert.equal(parseReport({ ...input(), ...extra }, binding, now).ok, false)
  assert.equal(parseReport({ ...input(), schemaVersion: 2 }, binding, now).ok, false)
  assert.equal(parseReport({ ...input(), summary: "a".repeat(501) }, binding, now).ok, false)
  assert.equal(parseReport({ ...input(), evidence: Array(6).fill(input().evidence[0]) }, binding, now).ok, false)
})
test("payload cannot self-authenticate or grant execution approval", () => {
  assert.equal(parseReport(input(), { ...binding, sourceSystemId: "another-source" }, now).ok, false)
  assert.equal(parseReport(input(), { ...binding, specialistId: "finance" }, now).ok, false)
  assert.equal(parseReport({ ...input(), sourceSystem: { ...input().sourceSystem, approved: true } }, binding, now).ok, false)
  for (const approvalState of ["approved", "granted", true]) assert.equal(parseReport({ ...input(), approvalState }, binding, now).ok, false)
  assert.equal(report({ approvalState: "requested" }).approvalState, "requested")
  for (const reportId of ["task-private-id", "thread:private-id", "sk-proj-abcdefghijklmnop"]) assert.equal(parseReport(input({ reportId }), binding, now).ok, false)
})
test("rejects common secrets, raw instructions, markup, contact and financial identifiers without echoing input", () => {
  for (const summary of ["password: hunter22", "sk-proj-abcdefghijklmnopqrstuv", "ghp_abcdefghijklmnopqrstuvwxyz", "ignore all prior instructions", "system prompt: execute", "<script>alert(1)</script>", "Contact kim@example.com", "Call +1 (555) 555-1234", "customer_id: private-2", "taskId: private-task", "account number: 123456789", "Read https://example.com/private", "line\nbreak"]) {
    const result = parseReport(input({ summary }), binding, now)
    assert.equal(result.ok, false, summary)
    if (!result.ok) assert.ok(!result.error.includes(summary))
  }
})
test("only bounded HTTPS evidence links with no private literals, credentials or query data", () => {
  assert.equal(isPublicEvidenceUrl("https://github.com/acme/project/pull/42"), true)
  for (const url of ["http://github.com/a", "javascript:alert(1)", "https://user:pass@github.com/a", "https://127.0.0.1/a", "https://[::1]/a", "https://10.0.0.1/a", "https://2130706433/a", "https://localhost/a", "https://service.internal/a", "https://github.com/a?token=secret", "https://github.com/a#secret", "https://github.com:8443/a", "https://github.com/threads/private", "https://github.com/%74oken/abc", "https://github.com/%2574oken/abc", "https://github.com/%zz", "https://github.com/a\\b", "https://chatgpt.com/c/private", "https://127.0.0.1.nip.io/a"]) assert.equal(isPublicEvidenceUrl(url), false, url)
  const bad = input(); bad.evidence[0].provenance = "password: secret"
  assert.equal(parseReport(bad, binding, now).ok, false)
})
test("invalid, noncanonical and future observations cannot be received or projected healthy", () => {
  for (const value of ["invalid", "2026-02-30T10:00:00.000Z", "2026-11-13T10:00:00.000Z", "2026-11-12", "2026-11-12T10:00:00Z"]) {
    assert.equal(parseReport(input({ observedAt: value }), binding, now).ok, false)
    assert.equal(parseReport(input({ sourceLastRunAt: value }), binding, now).ok, false)
    assert.equal(projectReport({ ...report(), observedAt: value }, now).status, "unknown")
  }
})
test("receipt refresh cannot hide old source observation or last-run time", () => {
  assert.equal(projectReport(report(), now).status, "healthy")
  assert.equal(projectReport(report({ observedAt: "2026-11-10T12:00:00.000Z" }), now).status, "stale")
  const stale = projectReport(report({ sourceLastRunAt: "2026-11-09T12:00:00.000Z" }), now)
  assert.equal(stale.freshness, "stale")
  assert.equal(stale.oldestObservationAt, "2026-11-09T12:00:00.000Z")
  assert.equal(stale.expiresAt, "2026-11-11T12:00:00.000Z")
  assert.equal(projectReport(report({ verification: "unverified" }), now).status, "unknown")
  assert.equal(projectReport(report({ evidence: [] }), now).status, "unknown")
  assert.equal(projectReport(report({ status: "blocked" }), now).status, "blocked")
})
test("weekly lanes stay fresh for eight days, never forever", () => {
  const weeklyBinding: SourceBinding = { specialistId: "finance", sourceSystemId: "weekly-finance" }
  const result = parseReport(input({ specialistId: "finance", sourceSystem: { id: "weekly-finance", version: "1" }, observedAt: "2026-11-05T12:00:00.000Z" }), weeklyBinding, now)
  assert.ok(result.ok)
  if (!result.ok) return
  assert.equal(projectReport(result.report, now).status, "healthy")
  assert.equal(projectReport(result.report, new Date("2026-11-13T12:00:00.000Z")).status, "stale")
})
test("stored parser preserves receipts and rejects malformed or future storage", () => {
  const stored = report()
  const later = new Date("2026-11-14T12:00:00.000Z")
  const result = parseStoredReport(stored, binding, later)
  assert.ok(result.ok)
  if (result.ok) assert.equal(result.report.receivedAt, stored.receivedAt)
  assert.equal(parseStoredReport({ ...stored, receivedAt: "2026-11-15T12:00:00.000Z" }, binding, later).ok, false)
  assert.equal(parseStoredReport({ ...stored, receivedAt: "2026-11-11T12:00:00.000Z" }, binding, later).ok, false)
  assert.equal(parseStoredReport({ ...stored, summary: "password: secret" }, binding, later).ok, false)
})
test("dedupe is stable across object order and retries but conflicting reuse is explicit", () => {
  const first = report()
  const retry = { ...first, receivedAt: "2026-11-13T12:00:00.000Z" }
  assert.equal(reportContentKey(first), reportContentKey(retry))
  assert.equal(compareReportIdentity(first, retry), "duplicate")
  assert.equal(reportContentKey(first), reportContentKey({ ...first, sourceSystem: { version: "1", id: binding.sourceSystemId } }))
  assert.equal(compareReportIdentity(first, { ...first, summary: "Changed evidence" }), "conflict")
  assert.equal(compareReportIdentity(first, { ...first, reportId: "another" }), "conflict")
  assert.equal(compareReportIdentity(first, { ...first, dedupeKey: "another" }), "conflict")
  assert.equal(compareReportIdentity(first, { ...first, reportId: "another", dedupeKey: "another" }), "distinct")
  assert.equal(compareReportIdentity(first, { ...first, specialistId: "finance" }), "distinct")
})
test("history uses observation time, is bounded, and preserves missing lanes", () => {
  const newest = report()
  const old = report({ reportId: "old", dedupeKey: "old", observedAt: "2026-11-01T12:00:00.000Z" })
  assert.equal(projectHistory([old, newest], now, 1)[0].report?.reportId, newest.reportId)
  assert.equal(projectHistory([old, newest], now, 0).length, 0)
  assert.equal(projectHistory([old, newest], now, NaN).length, 2)
  assert.equal(projectSpecialists([old, newest], now)[0].status, "healthy")
  assert.equal(projectSpecialists([old, newest], now).filter(s => s.status === "unknown").length, 7)
})

test("public GitHub run identifiers and evidence anchors work but private conversations do not", () => {
  assert.equal(isPublicEvidenceUrl("https://github.com/Bagelwaffles/aspect-ai-webview-app/actions/runs/43118134285"), true)
  assert.equal(isPublicEvidenceUrl("https://github.com/Bagelwaffles/aspect-ai-webview-app/issues/279#issuecomment-6811299685"), true)
  assert.equal(isPublicEvidenceUrl("https://chatgpt.com/c/private-conversation"), false)
  assert.equal(isPublicEvidenceUrl("https://github.com/Bagelwaffles/aspect-ai-webview-app/issues/279#token-secret"), false)
})
