import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { projectOwnerActivity } from "../lib/operations/owner-activity"
import { activityReport, approvalFixture, telemetryFixture } from "./fixtures/owner-activity"

const require = createRequire(import.meta.url)
// Rendering-only class-name stub, not a CSS layout engine or browser acceptance.
require.extensions[".css"] = (module, filename) => {
  const names = [...readFileSync(filename, "utf8").matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(match => match[1])
  module.exports = Object.fromEntries(names.map(name => [name, name]))
}
Object.assign(globalThis, { React })
const OwnerActivityCenter = require("../app/dashboard/OwnerActivityCenter").default

test("read-only center renders permission scope, uncertainty and separate task/release state", () => {
  const report = activityReport({ taskStatus: "APPROVAL_PENDING", ownerActionRequired: true, approval: approvalFixture({ reportedOutcome: "approved" }) })
  const html = renderToStaticMarkup(React.createElement(OwnerActivityCenter, { model: projectOwnerActivity(telemetryFixture([report])) }))
  for (const label of ["Owner Activity &amp; Approval Center", "What is happening now", "What needs owner review", "What finished", "What is blocked or failed", "What is uncertain or stale", "APPROVAL UNKNOWN", "Host approval status", "Deployment status", "Release status", "Requested action", "Capability / app or tool", "Target environment / site", "Risk / impact", "Data exposure", "Duration / persistence", "One-time permission", "not host confirmation", "original host request"]) assert.ok(html.includes(label), label)
  assert.match(html, /<label for="owner-activity-filter">/)
  assert.match(html, /<select id="owner-activity-filter"/)
  assert.match(html, /role="status" aria-live="polite"/)
  assert.match(html, /<time dateTime=/)
  assert.doesNotMatch(html, /<button[^>]*>\s*(?:Approve|Deny|Retry|Resend)/i)
  assert.equal((html.match(/Exact reported permission request/g) ?? []).length, 1)
})

test("completion and no-change show source result, time, evidence and recovery labels", () => {
  const report = activityReport({ taskStatus: "NO_CHANGE", completedAt: "2026-11-12T11:00:00.000Z", result: "Review completed without changes", changeSummary: "No change was required", toolStatus: "SUCCEEDED" })
  const html = renderToStaticMarkup(React.createElement(OwnerActivityCenter, { model: projectOwnerActivity(telemetryFixture([report])) }))
  for (const label of ["NO CHANGE", "Completed at source", "Review completed without changes", "No change was required", "Last successful step", "Recovery path", "Public Draft reference", "What changed since I last looked"]) assert.ok(html.includes(label), label)
})

test("unavailable sources never render an empty queue as confirmed completion", () => {
  const data = telemetryFixture()
  data.reports = { ...data.reports, state: "unavailable", data: null }
  const html = renderToStaticMarkup(React.createElement(OwnerActivityCenter, { model: projectOwnerActivity(data) }))
  assert.match(html, /Report source: unavailable/)
  assert.match(html, /Missing data is not an empty queue/)
  assert.match(html, /No retained activity events are available/)
  assert.match(html, /external work or requests may still exist/i)
})

test("responsive and focus contracts are explicit without claiming measured viewport acceptance", () => {
  const css = readFileSync("app/dashboard/owner-activity.module.css", "utf8")
  assert.match(css, /overflow-wrap:\s*anywhere/)
  assert.match(css, /minmax\(min\(100%, 300px\), 1fr\)/)
  assert.match(css, /flex-wrap:\s*wrap/)
  assert.match(css, /max-width:\s*100%/)
  assert.match(css, /min-height:\s*44px/)
  assert.match(css, /:focus-visible/)
  assert.match(css, /@media \(max-width: 480px\)/)
  const ui = readFileSync("app/dashboard/OwnerActivityCenter.tsx", "utf8")
  assert.doesNotMatch(ui, /\bfetch\s*\(|XMLHttpRequest|sendBeacon/)
  const page = readFileSync("app/dashboard/page.tsx", "utf8")
  assert.match(page, /reportingPreviewEnabled\(\) && reportingOwner \? await getOperationsTelemetry\(\) : null/)
  assert.match(readFileSync("app/dashboard/OperationsReporting.tsx", "utf8"), /<OwnerActivityCenter model=\{projectOwnerActivity\(data\)\}/)
})
