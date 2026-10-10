import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const privacy = readFileSync(new URL("../app/privacy/page.tsx", import.meta.url), "utf8")
const runbook = readFileSync(new URL("../docs/AMS_GMAIL_MANUAL_DELETION.md", import.meta.url), "utf8")

test("published Gmail deletion wording matches the manual procedure", () => {
  assert.match(privacy, /request manual deletion/)
  assert.match(privacy, /verifies deletion requests before acting and confirms completion/)
  assert.match(privacy, /does not currently provide an in-product Gmail disconnect or deletion control/)
  assert.match(privacy, /revoking access at Google does not by itself delete records already retained by AMS/)
  assert.match(runbook, /active, owner-authenticated AMS session/)
  assert.match(runbook, /Precise deletion scope/)
  assert.match(runbook, /Safe deletion execution/)
  assert.match(runbook, /Completion evidence/)
})

test("manual deletion is fail-closed and protects the other Gmail slot", () => {
  assert.match(runbook, /selected task has `enabled: false`/)
  assert.match(runbook, /SET key value NX EX 180/)
  assert.match(runbook, /Do not use a wildcard in `DEL`/)
  assert.match(runbook, /other slot's grant and task records still exist/)
  assert.match(runbook, /Automatic replies remain disabled and no message or notification was sent/)
  assert.doesNotMatch(runbook, /redis-cli\s+-a/u)
})
