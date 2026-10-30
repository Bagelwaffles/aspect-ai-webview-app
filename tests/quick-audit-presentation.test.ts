import assert from "node:assert/strict"
import test from "node:test"

import { buildBrandedHtmlArtifact } from "../lib/client-artifacts"
import { auditEvidenceStatusLabel, summarizeQuickAudit, summarizeQuickAuditEvidence } from "../lib/quick-audit-presentation"

test("audit executive summary reuses the ordered findings without inventing data", () => {
  const findings = Array.from({ length: 5 }, (_, index) => ({
    title: `Real finding ${index + 1}`,
    observation: `Observed ${index + 1}`,
    fix: `Fix ${index + 1}`,
  }))
  const sevenDayPlan = Array.from({ length: 7 }, (_, index) => ({ day: index + 1, action: `Action ${index + 1}` }))
  const summary = summarizeQuickAudit({ findings, sevenDayPlan })

  assert.equal(summary.findingsCount, 5)
  assert.equal(summary.planDaysCount, 7)
  assert.deepEqual(summary.priorityActions.map((item) => item.priority), [1, 2, 3])
  assert.deepEqual(summary.priorityActions.map((item) => item.title), [
    "Real finding 1", "Real finding 2", "Real finding 3",
  ])
  assert.equal(summary.priorityActions.some((item) => "score" in item || "roi" in item), false)
})

test("summary supports incomplete legacy data without guessing missing actions", () => {
  const summary = summarizeQuickAudit({ findings: [], sevenDayPlan: [] })
  assert.equal(summary.findingsCount, 0)
  assert.equal(summary.planDaysCount, 0)
  assert.deepEqual(summary.priorityActions, [])
})

test("report export HTML escapes dynamic finding text", () => {
  const summary = summarizeQuickAudit({
    findings: [{ title: "<script>alert(1)</script>", observation: "", fix: "<img src=x onerror=alert(1)>" }],
    sevenDayPlan: [],
  })
  const html = buildBrandedHtmlArtifact({
    title: "Marketing Audit",
    sections: [{
      heading: "First priorities",
      orderedItems: summary.priorityActions.map((item) => `${item.title} — ${item.fix}`),
    }],
  })
  assert.match(html, /&lt;script&gt;/)
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.equal(html.includes("<script>"), false)
  assert.equal(html.includes("<img"), false)
})

test("page check evidence distinguishes detected, not detected and unknown without false certainty", () => {
  const coverage = summarizeQuickAuditEvidence({
    hasClearValueProposition: true,
    hasPrimaryCta: false,
    hasLeadCapture: null,
    hasTestimonials: true,
    hasTitleAndMeta: false,
  })
  assert.equal(coverage.rows.length, 8)
  assert.equal(coverage.detectedCount, 2)
  assert.equal(coverage.notDetectedCount, 2)
  assert.equal(coverage.notVerifiedCount, 4)
  assert.equal(coverage.rows.find((row) => row.key === "hasLeadCapture")?.status, "not-verified")
  assert.equal(coverage.rows.find((row) => row.key === "hasPrimaryCta")?.status, "not-detected")
  assert.match(auditEvidenceStatusLabel("not-detected"), /Not detected/)
})

test("older audit record missing evidence cannot fabricate detected signals", () => {
  const coverage = summarizeQuickAuditEvidence(undefined)
  assert.equal(coverage.detectedCount, 0)
  assert.equal(coverage.notDetectedCount, 0)
  assert.equal(coverage.notVerifiedCount, coverage.rows.length)
})
