import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { parseReport } from "../lib/operations/reporting"
import { reportingFailureMessage } from "../lib/operations/reporting-feedback"

test("schema-valid unbroken report summaries require unconditional paragraph wrapping", () => {
  const parsed = parseReport({
    schemaVersion: 1, reportId: "layout-summary", dedupeKey: "layout-summary", specialistId: "engineering",
    sourceSystem: { id: "owner-reviewed-specialist:engineering", version: "1" },
    observedAt: "2026-11-12T00:00:00.000Z", sourceLastRunAt: "2026-11-12T00:00:00.000Z",
    status: "unknown", summary: "W".repeat(500), currentWork: "", blocker: "", nextAction: "",
    evidence: [], confidence: "low", verification: "unverified", approvalState: "none",
  }, { specialistId: "engineering", sourceSystemId: "owner-reviewed-specialist:engineering" }, new Date("2026-11-12T01:00:00.000Z"))
  assert.equal(parsed.ok, true, "The schema permits this long unbroken summary")
  const css = readFileSync("app/dashboard/operations-reporting.module.css", "utf8")
  const paragraphs = css.match(/\.root\s+p\s*\{([^}]+)\}/)?.[1] ?? ""
  assert.match(paragraphs, /overflow-wrap:\s*anywhere\s*;/)
  assert.doesNotMatch(paragraphs, /white-space:\s*nowrap/)
  assert.match(readFileSync("app/dashboard/OperationsReporting.tsx", "utf8"), /<p>\{report\.summary\}<\/p>/)
})

test("a confirmed identity conflict says rejected and does not recommend replaying changed content", () => {
  const message = reportingFailureMessage(new Error("REPORTING_IDENTITY_CONFLICT"))
  assert.match(message, /^REPORTING_IDENTITY_CONFLICT\./)
  assert.match(message, /rejected/i)
  assert.match(message, /existing report was not changed/i)
  assert.match(message, /read back the existing report/i)
  assert.match(message, /no automatic retry/i)
  assert.doesNotMatch(message, /may have succeeded|replay/i)
})

test("uncertain storage and readback failures keep same-identity reconciliation guidance", () => {
  for (const code of ["REPORTING_STORE_UNAVAILABLE", "REPORTING_READBACK_UNAVAILABLE", "REPORTING_READBACK_MISMATCH", "REPORTING_RECEIPT_INVALID"]) {
    const message = reportingFailureMessage(new Error(code))
    assert.ok(message.startsWith(`${code}.`))
    assert.match(message, /may have succeeded/)
    assert.match(message, /same report ID and payload/)
    assert.match(message, /no automatic retry/i)
    assert.doesNotMatch(message, /existing report was not changed/i)
  }
})

test("unknown failures do not disclose raw error or dependency details", () => {
  for (const error of [new Error("private provider response"), "private provider response", null]) {
    const message = reportingFailureMessage(error)
    assert.ok(message.startsWith("REPORTING_OUTCOME_UNCONFIRMED."))
    assert.doesNotMatch(message, /private provider/)
  }
})
