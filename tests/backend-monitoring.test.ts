import assert from "node:assert/strict"
import test from "node:test"

import {
  authorizeMonitoringCron,
  extractLiveAgentCountsFromText,
  isStaleAt,
  monitorStatusRank,
  scheduledTaskHealth,
} from "@/lib/server/backend-monitoring"
import { initialTaskState, scheduledTaskDefinitions } from "@/lib/server/scheduled-task-engine"

test("scheduled supervisor distinguishes disabled jobs and manual success from independent proof", () => {
  const now = new Date("2026-10-06T13:00:00Z")
  const state = initialTaskState(scheduledTaskDefinitions[0], "owner", now)
  assert.deepEqual(scheduledTaskHealth([state], now), { enabled: 0, issues: [] })
  state.enabled = true; state.lastSuccess = now.toISOString()
  assert.ok(scheduledTaskHealth([state], now).issues.some(issue => issue.includes("not proven")))
  state.lastScheduledSuccess = now.toISOString()
  assert.deepEqual(scheduledTaskHealth([state], now).issues, [])
  state.nextExecution = "2026-10-01T13:00:00Z"
  assert.ok(scheduledTaskHealth([state], now).issues.some(issue => issue.includes("overdue")))
})

test("monitor severity ordering is stable", () => {
  assert.ok(monitorStatusRank("critical") > monitorStatusRank("warning"))
  assert.ok(monitorStatusRank("warning") > monitorStatusRank("not_configured"))
  assert.ok(monitorStatusRank("not_configured") > monitorStatusRank("info"))
  assert.ok(monitorStatusRank("info") > monitorStatusRank("ok"))
})

test("live-agent count extraction detects public catalog claims", () => {
  assert.deepEqual(
    extractLiveAgentCountsFromText("Plans include 7 Live agents. Previously 5 live agents were available."),
    [7, 5],
  )
  assert.deepEqual(extractLiveAgentCountsFromText("No count is stated here."), [])
})

test("stale task detection honors the requested age", () => {
  const now = new Date("2026-09-21T12:00:00.000Z")
  assert.equal(
    isStaleAt("2026-09-20T11:59:59.000Z", now, 24 * 60 * 60 * 1000),
    true,
  )
  assert.equal(
    isStaleAt("2026-09-21T11:59:59.000Z", now, 24 * 60 * 60 * 1000),
    false,
  )
})

test("cron authorization fails closed and accepts only the configured secret", () => {
  const env = { CRON_SECRET: "this-is-a-long-monitoring-secret", NODE_ENV: "test" } as NodeJS.ProcessEnv
  assert.equal(authorizeMonitoringCron(null, env), false)
  assert.equal(authorizeMonitoringCron("Bearer wrong-secret", env), false)
  assert.equal(
    authorizeMonitoringCron("Bearer this-is-a-long-monitoring-secret", env),
    true,
  )
  assert.equal(authorizeMonitoringCron("Bearer anything", { NODE_ENV: "test" } as NodeJS.ProcessEnv), false)
})
