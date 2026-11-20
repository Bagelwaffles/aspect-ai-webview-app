import assert from "node:assert/strict"
import test from "node:test"
import { projectMonitorSnapshot, readMonitoringEvidence, readMaintenanceEvidence, MONITOR_DEFINITIONS } from "../lib/server/operations-telemetry"
import { REPORTING_PREVIEW_BRANCH, isReportingOwnerEmail, type ReportingRedis } from "../lib/server/operations-report-store"
const now = new Date("2026-11-12T12:00:00.000Z")
const env = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: REPORTING_PREVIEW_BRANCH, UPSTASH_REDIS_REST_URL: "https://accepted-quetzal-206056.upstash.io", UPSTASH_REDIS_REST_TOKEN: "test-only-token" } as unknown as NodeJS.ProcessEnv
function snapshot(at = now.toISOString()) {
  return { version: "backend-monitoring-v1", checkedAt: at, results: MONITOR_DEFINITIONS.map(([key]) => ({ key, status: "ok", checkedAt: at })) }
}
function fake(get: ReportingRedis["get"], lrange: ReportingRedis["lrange"] = async () => []) {
  return { get, lrange, eval: async () => { throw new Error("Writes prohibited in telemetry tests") } } as ReportingRedis
}
test("legacy OK/configuration signals never become green health and missing monitors stay unknown", () => {
  const result = projectMonitorSnapshot(snapshot(), now)!
  assert.equal(result.rows.length, 10)
  assert.ok(result.rows.every(row => row.status === "unknown" && row.reportedStatus === "ok"))
  assert.ok(projectMonitorSnapshot({ ...snapshot(), results: [] }, now)!.rows.every(row => row.status === "unknown"))
})
test("stored observation governs stale status even when freshly read; latest failure remains visible", () => {
  const old = snapshot("2026-11-01T12:00:00.000Z")
  assert.ok(projectMonitorSnapshot(old, now)!.rows.every(row => row.status === "stale"))
  const current = snapshot()
  current.results[0].status = "critical"
  assert.equal(projectMonitorSnapshot(current, now)!.rows[0].status, "blocked")
})
test("invalid/future/duplicate/unknown source snapshots are rejected, not treated empty", () => {
  for (const input of [null, {}, snapshot("2026-11-13T00:00:00.000Z"), { ...snapshot(), results: [snapshot().results[0], snapshot().results[0]] }, { ...snapshot(), results: [{ key: "fake", status: "ok", checkedAt: now.toISOString() }] }]) assert.equal(projectMonitorSnapshot(input, now), null)
})
test("successful empty events differs from failed query and a missing snapshot", async () => {
  const empty = await readMonitoringEvidence({ env, now, redis: fake(async () => null) })
  assert.equal(empty.snapshot.state, "unknown")
  assert.equal(empty.events.state, "available")
  assert.deepEqual(empty.events.data, [])
  const failed = await readMonitoringEvidence({ env, now, redis: fake(async () => { throw new Error("private provider error") }, async () => { throw new Error("down") }) })
  assert.equal(failed.snapshot.state, "unavailable")
  assert.equal(failed.events.state, "unavailable")
  assert.equal(failed.events.data, null)
  assert.ok(!JSON.stringify(failed).includes("private provider error"))
})
test("monitor projection minimizes private result details and preserves source timestamp", async () => {
  const original = { ...snapshot(), private: "hidden", results: snapshot().results.map(row => ({ ...row, summary: "customer secret", details: ["sensitive"] })) }
  const read = await readMonitoringEvidence({ env, now, redis: fake(async <T>() => original as T) })
  assert.equal(read.snapshot.state, "available")
  assert.ok(!JSON.stringify(read).includes("customer secret"))
  assert.equal(read.snapshot.data?.observedAt, original.checkedAt)
})
test("Production and substituted datastore reject before any read", async () => {
  let called = false
  const redis = fake(async () => { called = true; return null })
  for (const changed of [{ VERCEL_ENV: "production" }, { UPSTASH_REDIS_REST_URL: "https://different.upstash.io" }]) {
    assert.equal((await readMonitoringEvidence({ env: { ...env, ...changed }, redis, now })).snapshot.state, "unavailable")
    assert.equal((await readMaintenanceEvidence({ env: { ...env, ...changed }, redis, now })).state, "unavailable")
  }
  assert.equal(called, false)
})
test("maintenance incomplete history is unavailable, verified empty query remains empty", async () => {
  assert.deepEqual((await readMaintenanceEvidence({ env, now, redis: fake(async () => null) })).data, [])
  const missing = await readMaintenanceEvidence({ env, now, redis: fake(async () => null, async <T>() => ["a".repeat(40)] as T[]) })
  assert.equal(missing.state, "unavailable")
  assert.equal(missing.data, null)
})

test("reporting owner gate denies other signed internal admins and unconfigured owner", () => {
  const configured = { ...env, AMS_OWNER_EMAIL: "owner@example.org" }
  assert.equal(isReportingOwnerEmail(" OWNER@example.org ", configured), true)
  assert.equal(isReportingOwnerEmail("other-admin@example.org", configured), false)
  assert.equal(isReportingOwnerEmail(undefined, configured), false)
  assert.equal(isReportingOwnerEmail("owner@example.org", env), false)
})
test("future maintenance observation and CI proof cannot masquerade as current", async () => {
  const base = { id: "a".repeat(40), area: "engineering", state: "checks_passed", sourceObservedAt: now.toISOString(), updatedAt: now.toISOString(), policy: "escalate", pr: { url: "https://github.com/Bagelwaffles/aspect-ai-webview-app/pull/280", headSha: "b".repeat(40), ciVerifiedAt: now.toISOString() } }
  for (const record of [{ ...base, sourceObservedAt: "2026-11-13T00:00:00.000Z" }, { ...base, pr: { ...base.pr, ciVerifiedAt: "2026-11-13T00:00:00.000Z" } }]) {
    const read = await readMaintenanceEvidence({ env, now, redis: fake(async <T>() => record as T, async <T>() => [base.id] as T[]) })
    assert.equal(read.state, "unavailable")
  }
})
