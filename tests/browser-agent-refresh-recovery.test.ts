import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync("app/dashboard/browser-control/operator/BrowserOperatorClient.tsx", "utf8")

test("Browser Agent persists an active run across control-panel refreshes", () => {
  assert.match(source, /OPERATOR_RUN_STORAGE_KEY = "ams\.browser-operator\.run\.v1"/)
  assert.match(source, /window\.localStorage\.getItem\(OPERATOR_RUN_STORAGE_KEY\)/)
  assert.match(source, /window\.localStorage\.setItem\(OPERATOR_RUN_STORAGE_KEY/)
  assert.match(source, /rootGoal,/)
  assert.match(source, /messages: messages\.slice\(-MAX_PERSISTED_MESSAGES\)/)
  assert.match(source, /activeJobId,/)
  assert.match(source, /stepCount,/)
})

test("restored Browser Agent runs are paused to avoid duplicate actions", () => {
  assert.match(source, /setAutoMode\(false\)/)
  assert.match(source, /setRecoveredRun\(true\)/)
  assert.match(source, /Previous Browser Agent run recovered after refresh/)
  assert.match(source, /paused to prevent duplicate actions/)
  assert.match(source, /Press Continue to resume from the current browser state/)
})

test("stale persisted Browser Agent runs expire", () => {
  assert.match(source, /OPERATOR_RUN_MAX_AGE_MS = 12 \* 60 \* 60 \* 1_000/)
  assert.match(source, /Date\.now\(\) - persisted\.savedAt > OPERATOR_RUN_MAX_AGE_MS/)
  assert.match(source, /window\.localStorage\.removeItem\(OPERATOR_RUN_STORAGE_KEY\)/)
})
