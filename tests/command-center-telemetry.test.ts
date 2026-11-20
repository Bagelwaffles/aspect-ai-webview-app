import assert from "node:assert/strict"
import test from "node:test"

import { readRecentFiverrOperations } from "../lib/server/fiverr-operations"
import { telemetryStatus } from "../lib/operations/telemetry-status"

type Client = NonNullable<Parameters<typeof readRecentFiverrOperations>[1]>
function fakeClient(ids: string[], value: unknown = null): Client {
  return { lrange: async () => ids, get: async () => value } as unknown as Client
}

test("configuration alone is neutral and explicitly unverified", () => {
  assert.deepEqual(telemetryStatus("configured"), { label: "Configured; not verified", tone: "neutral" })
  assert.equal(telemetryStatus("ready").tone, "good")
  assert.equal(telemetryStatus("unavailable").tone, "warn")
})

test("unconfigured Fiverr storage is unknown, not successful empty", async () => {
  const result = await readRecentFiverrOperations(8, null)
  assert.equal(result.state, "not_configured")
  assert.match(result.error!, /unknown/)
})

test("successful empty Fiverr read preserves a ready empty result and provenance", async () => {
  const result = await readRecentFiverrOperations(8, fakeClient([]))
  assert.equal(result.state, "ready")
  assert.deepEqual(result.records, [])
  assert.equal(result.error, null)
  assert.equal(result.source, "Redis Fiverr Bridge records")
  assert.ok(Number.isFinite(Date.parse(result.checkedAt)))
})

test("failed Fiverr query remains unavailable, never an empty success", async () => {
  const client = { lrange: async () => { throw new Error("mock query failure") } } as unknown as Client
  const result = await readRecentFiverrOperations(8, client)
  assert.equal(result.state, "unavailable")
  assert.match(result.error!, /unknown/)
})

test("missing indexed Fiverr records are unavailable instead of successful empty", async () => {
  const result = await readRecentFiverrOperations(8, fakeClient(["missing-record"]))
  assert.equal(result.state, "unavailable")
})

test("failed Fiverr record read is unavailable", async () => {
  const client = { lrange: async () => ["record"], get: async () => { throw new Error("mock failure") } } as unknown as Client
  assert.equal((await readRecentFiverrOperations(8, client)).state, "unavailable")
})
