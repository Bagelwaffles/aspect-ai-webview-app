import assert from "node:assert/strict"
import test from "node:test"
import { createHash } from "node:crypto"
import { projectSpecialists, reportContentKey } from "../lib/operations/reporting"
import { readFileSync } from "node:fs"
import { REPORTING_PREVIEW_BRANCH, REPORT_PREFIX, REPORT_HISTORY_LIMIT, REPORT_RETENTION_SECONDS, REPORT_WRITE_SCRIPT, reportingPreviewEnabled, reportingStoreGate, readSpecialistReports, saveSpecialistReport, type ReportingRedis } from "../lib/server/operations-report-store"
import type { ReportInput, SpecialistId } from "../lib/operations/reporting"

const now = new Date("2026-11-12T12:00:00.000Z")
const env = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: REPORTING_PREVIEW_BRANCH, UPSTASH_REDIS_REST_URL: "https://accepted-quetzal-206056.upstash.io", UPSTASH_REDIS_REST_TOKEN: "dummy-test-token" } as unknown as NodeJS.ProcessEnv

test("unrecognized storage replies stay uncertain instead of claiming a confirmed identity conflict", async () => {
  for (const result of [null, {}, [], ["unexpected"], ["created"], ["duplicate"], ["conflict", "unexpected"]]) {
    const redis: ReportingRedis = { get: async () => null, lrange: async () => [], eval: async () => result }
    await assert.rejects(saveSpecialistReport("engineering", input(), { env, now, redis }), /REPORTING_STORE_RESPONSE_INVALID/)
  }
})

function input(overrides: Partial<ReportInput> = {}): ReportInput {
  return { schemaVersion: 1, reportId: "test-report", dedupeKey: "test-dedupe", specialistId: "engineering", sourceSystem: { id: "owner-reviewed-specialist:engineering", version: "1" }, observedAt: "2026-11-12T10:00:00.000Z", sourceLastRunAt: "2026-11-12T11:00:00.000Z", status: "healthy", summary: "Preview checks passed.", currentWork: "Review reporting", blocker: "", nextAction: "Owner review", evidence: [], confidence: "high", verification: "owner_attested", approvalState: "none", ...overrides }
}
// In-memory model of the transaction contract. No real Redis/client/network is used.
class FakeRedis implements ReportingRedis {
  values = new Map<string, string>()
  history = new Map<string, unknown[]>()
  writes = 0
  latestWrites = 0
  async get<T>(key: string) { return (this.values.get(key) ?? null) as T | null }
  async lrange<T>(key: string, start: number, stop: number) { return (this.history.get(key) ?? []).slice(start, stop + 1) as T[] }
  async eval(script: string, keys: string[], args: string[]) {
    assert.equal(script, REPORT_WRITE_SCRIPT)
    assert.equal(args[2], String(REPORT_RETENTION_SECONDS))
    assert.equal(args[3], String(REPORT_HISTORY_LIMIT))
    const a = this.values.get(keys[0]); const b = this.values.get(keys[1])
    if (a || b) {
      if (!a || !b || a !== b || JSON.parse(a).contentHash !== args[0]) return ["conflict"]
      return ["duplicate", a]
    }
    assert.equal(keys.length, 4)
    const incoming = JSON.parse(args[1]).report
    const latestRaw = this.values.get(keys[3])
    const latest = latestRaw ? JSON.parse(latestRaw).report : null
    if (!latest || incoming.observedAt > latest.observedAt || (incoming.observedAt === latest.observedAt && incoming.reportId < latest.reportId)) {
      this.values.set(keys[3], args[1]); this.latestWrites++
    }
    this.writes++
    this.values.set(keys[0], args[1]); this.values.set(keys[1], args[1])
    this.history.set(keys[2], [args[1], ...(this.history.get(keys[2]) ?? [])].slice(0, REPORT_HISTORY_LIMIT))
    return ["created", args[1]]
  }
}
test("exact Preview branch and pinned Redis identity fail closed even with injected clients", async () => {
  assert.equal(reportingStoreGate(env), null)
  assert.equal(reportingPreviewEnabled(env), true)
  for (const overrides of [{ VERCEL_ENV: "production" }, { VERCEL_ENV: "development" }, { VERCEL_ENV: undefined }, { VERCEL_GIT_COMMIT_REF: "main" }, { VERCEL_GIT_COMMIT_REF: REPORTING_PREVIEW_BRANCH + "-other" }]) {
    const bad = { ...env, ...overrides }
    assert.equal(reportingStoreGate(bad), "REPORTING_PREVIEW_ONLY")
    await assert.rejects(saveSpecialistReport("engineering", input(), { env: bad, now, redis: new FakeRedis() }), /REPORTING_PREVIEW_ONLY/)
  }
  for (const url of ["https://different.upstash.io", env.UPSTASH_REDIS_REST_URL + "/other", env.UPSTASH_REDIS_REST_URL + "?x=1", env.UPSTASH_REDIS_REST_URL + "#x", "http://accepted-quetzal-206056.upstash.io", "https://user:pass@accepted-quetzal-206056.upstash.io", "not a URL"]) assert.equal(reportingStoreGate({ ...env, UPSTASH_REDIS_REST_URL: url }), "REPORTING_STORE_IDENTITY_UNVERIFIED")
  for (const key of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) assert.equal(reportingStoreGate({ ...env, [key]: " " }), "REPORTING_STORE_NOT_CONFIGURED")
})
test("identical replay preserves receipt and history without rewriting retention", async () => {
  const redis = new FakeRedis()
  const first = await saveSpecialistReport("engineering", input(), { env, now, redis })
  const later = new Date("2026-11-13T12:00:00.000Z")
  const replay = await saveSpecialistReport("engineering", input(), { env, now: later, redis })
  assert.equal(first.created, true); assert.equal(replay.created, false)
  assert.deepEqual(replay.report, first.report)
  assert.equal(replay.report.receivedAt, now.toISOString())
  assert.equal(redis.writes, 1)
  assert.equal(redis.latestWrites, 1)
  const read = await readSpecialistReports({ env, now: later, redis })
  assert.equal(read.state, "available"); assert.deepEqual(read.data, [first.report])
})
test("same ID or dedupe with changed semantic content conflicts and preserves original", async () => {
  const redis = new FakeRedis()
  const options = { env, now, redis }
  const original = await saveSpecialistReport("engineering", input(), options)
  for (const change of [{ summary: "Changed conclusion" }, { reportId: "other-id" }, { dedupeKey: "other-dedupe" }]) await assert.rejects(saveSpecialistReport("engineering", input(change), options), /REPORTING_IDENTITY_CONFLICT/)
  assert.equal(redis.writes, 1)
  assert.deepEqual((await readSpecialistReports(options)).data, [original.report])
  assert.equal((await saveSpecialistReport("engineering", input({ reportId: "new-id", dedupeKey: "new-dedupe" }), options)).created, true)
  assert.equal((await readSpecialistReports(options)).data?.length, 2)
})
test("unknown lanes, source mismatches and report lane mismatches never write", async () => {
  const redis = new FakeRedis()
  for (const [lane, report] of [["unknown", input()], ["finance", input()], ["engineering", input({ sourceSystem: { id: "spoofed", version: "1" } })]] as const) await assert.rejects(saveSpecialistReport(lane as SpecialistId, report, { env, now, redis }), /REPORTING_PAYLOAD_INVALID/)
  assert.equal(redis.writes, 0)
})
test("malformed storage or failed persistence never becomes available empty history", async () => {
  const redis = new FakeRedis()
  for (const row of ["not json", "{}", JSON.stringify({ report: input() }), { report: { ...input(), receivedAt: "2099-01-01T00:00:00.000Z" } }]) {
    redis.history.set(`${REPORT_PREFIX}:engineering:history`, [row])
    assert.deepEqual(await readSpecialistReports({ env, now, redis }), { state: "unavailable", data: null, checkedAt: now.toISOString(), error: "REPORTING_READ_FAILED" })
  }
  const failed: ReportingRedis = { get: async () => { throw new Error("offline") }, lrange: async () => { throw new Error("offline") }, eval: async () => { throw new Error("offline") } }
  assert.equal((await readSpecialistReports({ env, now, redis: failed })).state, "unavailable")
  await assert.rejects(saveSpecialistReport("engineering", input(), { env, now, redis: failed }), /offline/)
  assert.equal((await readSpecialistReports({ env: { ...env, UPSTASH_REDIS_REST_TOKEN: "" }, now, redis })).state, "not_configured")
  assert.equal((await readSpecialistReports({ env, now, redis: new FakeRedis() })).state, "available")
})
test("bounded history and expired reports retain explicit available state", async () => {
  const redis = new FakeRedis()
  for (let i = 0; i < REPORT_HISTORY_LIMIT + 2; i++) await saveSpecialistReport("engineering", input({ reportId: `r-${i}`, dedupeKey: `d-${i}` }), { env, now, redis })
  assert.equal((await readSpecialistReports({ env, now, redis })).data?.length, REPORT_HISTORY_LIMIT + 1)
  assert.deepEqual((await readSpecialistReports({ env, now: new Date(now.getTime() + REPORT_RETENTION_SECONDS * 1000), redis })).data, [])
})
test("Lua transaction checks both identities before any writes and duplicate return precedes expiry updates", () => {
  assert.ok(REPORT_WRITE_SCRIPT.indexOf("return {'duplicate', byId}") < REPORT_WRITE_SCRIPT.indexOf("redis.call('SET'"))
  assert.match(REPORT_WRITE_SCRIPT, /not byId or not byDedupe or byId ~= byDedupe/)
  assert.match(REPORT_WRITE_SCRIPT, /old.contentHash ~= ARGV\[1\]/)
  assert.match(REPORT_WRITE_SCRIPT, /LTRIM/)
  assert.match(REPORT_WRITE_SCRIPT, /EXPIRE/)
  assert.match(readFileSync("lib/server/operations-report-store.ts", "utf8"), /retry: false/)
})

function stored(report: Awaited<ReturnType<typeof saveSpecialistReport>>["report"]) {
  return JSON.stringify({ contentHash: createHash("sha256").update(reportContentKey(report)).digest("hex"), report })
}
test("more than 100 newly received older reports cannot evict the latest observation", async () => {
  const redis = new FakeRedis()
  const first = await saveSpecialistReport("engineering", input({ reportId: "newest-evidence", dedupeKey: "newest-evidence", status: "blocked" }), { env, now, redis })
  const pointer = redis.values.get(`${REPORT_PREFIX}:engineering:latest`)
  const later = new Date(now.getTime() + 60000)
  for (let i = 0; i < REPORT_HISTORY_LIMIT + 2; i++) await saveSpecialistReport("engineering", input({ reportId: `older-${i}`, dedupeKey: `older-${i}`, observedAt: "2026-11-11T10:00:00.000Z" }), { env, now: later, redis })
  const result = await readSpecialistReports({ env, now: later, redis })
  assert.equal(result.state, "available")
  assert.equal(result.data?.length, REPORT_HISTORY_LIMIT + 1)
  assert.equal(projectSpecialists(result.data!, later)[0].report?.reportId, first.report.reportId)
  assert.equal(redis.values.get(`${REPORT_PREFIX}:engineering:latest`), pointer)
  assert.equal(redis.latestWrites, 1)
  await saveSpecialistReport("engineering", input({ reportId: "newest-evidence", dedupeKey: "newest-evidence", status: "blocked" }), { env, now: later, redis })
  assert.equal(redis.latestWrites, 1)
  assert.equal(redis.values.get(`${REPORT_PREFIX}:engineering:latest`), pointer)
})
test("latest and history copies dedupe, while malformed or conflicting copies fail closed", async () => {
  const redis = new FakeRedis()
  const first = await saveSpecialistReport("engineering", input(), { env, now, redis })
  assert.equal((await readSpecialistReports({ env, now, redis })).data?.length, 1)
  const key = `${REPORT_PREFIX}:engineering:latest`
  for (const corrupt of ["not-json", "{}", JSON.stringify({ contentHash: "wrong", report: first.report }), stored({ ...first.report, summary: "Conflicting conclusion" }), stored({ ...first.report, reportId: "different-id" })]) {
    redis.values.set(key, corrupt)
    const read = await readSpecialistReports({ env, now, redis })
    assert.equal(read.state, "unavailable"); assert.equal(read.data, null)
  }
})
test("latest pointer advances only for newer observation and preserves server receipt", async () => {
  const redis = new FakeRedis()
  await saveSpecialistReport("engineering", input(), { env, now, redis })
  const later = new Date(now.getTime() + 60000)
  const newest = await saveSpecialistReport("engineering", input({ reportId: "advanced", dedupeKey: "advanced", observedAt: now.toISOString() }), { env, now: later, redis })
  assert.equal(redis.latestWrites, 2)
  assert.equal(JSON.parse(redis.values.get(`${REPORT_PREFIX}:engineering:latest`)!).report.receivedAt, later.toISOString())
  assert.equal(projectSpecialists((await readSpecialistReports({ env, now: later, redis })).data!, later)[0].report?.reportId, newest.report.reportId)
})
test("credential-shaped IDs and source versions are rejected before persistence", async () => {
  const redis = new FakeRedis()
  const secret = "ghp_abcdefghijklmnopqrstuvwxyz"
  for (const report of [input({ reportId: secret }), input({ dedupeKey: secret }), input({ sourceSystem: { id: "owner-reviewed-specialist:engineering", version: secret } }), input({ sourceSystem: { id: secret, version: "1" } })]) {
    await assert.rejects(saveSpecialistReport("engineering", report, { env, now, redis }), /REPORTING_PAYLOAD_INVALID/)
  }
  assert.equal(redis.writes, 0)
  assert.equal(redis.latestWrites, 0)
})

test("mixed-case equal-observation ordering agrees with Lua after older-history eviction", async () => {
  const redis = new FakeRedis()
  await saveSpecialistReport("engineering", input({ reportId: "a", dedupeKey: "a", status: "healthy" }), { env, now, redis })
  await saveSpecialistReport("engineering", input({ reportId: "Z", dedupeKey: "Z", status: "blocked" }), { env, now, redis })
  const before = projectSpecialists((await readSpecialistReports({ env, now, redis })).data!, now)[0]
  assert.equal(before.report?.reportId, "Z")
  for (let i = 0; i < 102; i++) await saveSpecialistReport("engineering", input({ reportId: `older-${i}`, dedupeKey: `older-${i}`, observedAt: "2026-11-11T10:00:00.000Z" }), { env, now, redis })
  const after = projectSpecialists((await readSpecialistReports({ env, now, redis })).data!, now)[0]
  assert.equal(after.report?.reportId, "Z")
  assert.equal(after.status, "blocked")
})
