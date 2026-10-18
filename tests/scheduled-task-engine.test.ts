import test from "node:test"
import assert from "node:assert/strict"
import { createTaskDelivery, initialTaskState, nextTaskExecution, operateScheduledTask, scheduledTaskDefinitions, taskErrorCode, type TaskState, type TaskStore, type TaskWorker } from "../lib/server/scheduled-task-engine"
const definition = scheduledTaskDefinitions[0]
const now = new Date("2026-10-06T13:05:00Z")
class MemoryStore implements TaskStore {
  state: TaskState | null = null
  lease: string | null = null
  async read() { return this.state ? structuredClone(this.state) : null }
  async lock(_id: string, token: string) { if (this.lease) return false; this.lease = token; return true }
  async write(_id: string, token: string, state: TaskState) { if (this.lease !== token) throw new Error("TASK_LEASE_LOST"); this.state = structuredClone(state) }
  async release(_id: string, token: string) { if (this.lease === token) this.lease = null }
}
function fixture() {
  const store = new MemoryStore()
  store.state = initialTaskState(definition, "owner", now)
  store.state.enabled = true; store.state.nextExecution = "2026-10-06T13:00:00Z"
  const worker: TaskWorker = async () => ({ summary: "Source-backed alert", details: { source: "official" }, alert: true, discoveries: ["discovery-1"], dataQuality: "verified" })
  return { definition, owner: "owner", store, worker, deliver: async () => "receipt-1", now }
}
test("daily and weekly schedules follow Chicago DST", () => {
  assert.equal(nextTaskExecution(definition.schedule, new Date("2026-10-31T13:01:00Z")), "2026-11-01T14:00:00.000Z")
  assert.equal(nextTaskExecution(definition.schedule, new Date("2026-03-07T14:01:00Z")), "2026-03-08T13:00:00.000Z")
  assert.equal(nextTaskExecution(scheduledTaskDefinitions[1].schedule, new Date("2026-10-31T13:00:00Z")), "2026-11-02T01:00:00.000Z")
})
test("DST repeated local hour does not duplicate a daily slot; nonexistent time is skipped", () => {
  const schedule = { ...definition.schedule, hour: 1, minute: 30 }
  assert.equal(nextTaskExecution(schedule, new Date("2026-11-01T06:30:00Z")), "2026-11-02T07:30:00.000Z")
  assert.equal(nextTaskExecution({ ...schedule, hour: 2 }, new Date("2026-03-08T07:00:00Z")), "2026-03-09T07:30:00.000Z")
})
test("new jobs are disabled; no manual, retry, or scheduled work or delivery runs while paused", async () => {
  const input = fixture(); input.store.state!.enabled = false
  input.worker = async () => { throw new Error("UNEXPECTED_WORK") }
  input.deliver = async () => { throw new Error("UNEXPECTED_DELIVERY") }
  for (const action of ["tick", "run", "retry"] as const) assert.equal((await operateScheduledTask({ ...input, action })).outcome, "disabled")
  assert.equal(initialTaskState(definition, "owner", now).enabled, false)
})
test("real result, discovery IDs, independent scheduled proof and delivery receipt persist before cutover", async () => {
  const input = fixture()
  const result = await operateScheduledTask({ ...input, action: "tick" })
  assert.equal(result.outcome, "succeeded")
  assert.equal(input.store.state!.lastScheduledSuccess, now.toISOString())
  assert.equal(input.store.state!.history[0].deliveryReceipt, "receipt-1")
  assert.deepEqual(input.store.state!.findings, ["discovery-1"])
  assert.equal((await operateScheduledTask({ ...input, action: "tick" })).outcome, "not-due")
})
test("distributed lease permits only one concurrent worker", async () => {
  const input = fixture(); let release!: () => void; let calls = 0
  input.worker = async () => { calls++; await new Promise<void>(resolve => { release = resolve }); return { summary: "complete", details: {}, alert: false, dataQuality: "verified" } }
  const first = operateScheduledTask({ ...input, action: "tick" })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal((await operateScheduledTask({ ...input, action: "tick" })).outcome, "busy")
  release(); await first; assert.equal(calls, 1)
})
test("manual run request key is idempotent and cannot masquerade as scheduled proof", async () => {
  const input = fixture(); let calls = 0; const worker = input.worker
  input.worker = async (...args) => { calls++; return worker(...args) }
  await operateScheduledTask({ ...input, action: "run", requestId: "same-owner-request" })
  assert.equal((await operateScheduledTask({ ...input, now: new Date(now.getTime() + 1000), action: "run", requestId: "same-owner-request" })).outcome, "already-completed")
  assert.equal(calls, 1); assert.equal(input.store.state!.lastScheduledSuccess, null)
})
test("a manually dispatched scheduler tick cannot masquerade as independent scheduled proof", async () => {
  const input = fixture()
  await operateScheduledTask({ ...input, action: "tick", independentSchedule: false })
  assert.equal(input.store.state!.lastScheduledSuccess, null)
  assert.equal(input.store.state!.lastScheduledTrigger, null)
})
test("failures back off, stop after bounded retries, and do not mark success", async () => {
  const input = fixture(); input.worker = async () => { throw new Error("TASK_SOURCE_UNAVAILABLE") }
  await operateScheduledTask({ ...input, action: "tick" })
  assert.equal(input.store.state!.lastSuccess, null)
  assert.equal((await operateScheduledTask({ ...input, now: new Date(now.getTime() + 1000), action: "tick" })).outcome, "backoff")
  for (let i = 0; i < 3; i++) await operateScheduledTask({ ...input, now: new Date(input.store.state!.retryAt!), action: "tick" })
  assert.equal(input.store.state!.retryCount, 4); assert.equal(input.store.state!.retryAt, null)
  assert.equal(input.store.state!.history.filter(run => run.notification === "delivered").length, 1)
})
test("delivery is durable and retried without repeating underlying business execution", async () => {
  const input = fixture(); let executions = 0; const worker = input.worker
  input.worker = async (...args) => { executions++; return worker(...args) }
  input.deliver = async () => null as unknown as string
  await operateScheduledTask({ ...input, action: "tick" })
  const deliveryAt = input.store.state!.history[0].nextDeliveryAt!
  assert.equal(input.store.state!.history[0].notification, "pending")
  input.deliver = async () => "owner-provider-receipt"
  await operateScheduledTask({ ...input, now: new Date(deliveryAt), action: "tick" })
  assert.equal(executions, 1); assert.equal(input.store.state!.history[0].notification, "delivered")
})
test("expired lease cannot overwrite durable state or delete a newer lock", async () => {
  const input = fixture()
  input.worker = async () => { input.store.lease = "new-worker-lease"; return { summary: "late", details: {}, alert: false, dataQuality: "verified" } }
  await assert.rejects(operateScheduledTask({ ...input, action: "tick" }), /TASK_LEASE_LOST/u)
  assert.equal(input.store.lease, "new-worker-lease"); assert.equal(input.store.state!.lastSuccess, null)
})
test("interrupted work recovers and missed runs coalesce instead of burst replay", async () => {
  const input = fixture(); input.store.state!.nextExecution = "2026-10-01T13:00:00Z"
  await operateScheduledTask({ ...input, action: "tick" })
  assert.equal(input.store.state!.history.length, 1); assert.equal(input.store.state!.missedRun, true)
  assert.equal(input.store.state!.nextExecution, "2026-10-07T13:00:00.000Z")
})
test("owner mismatch fails closed; arbitrary upstream errors are redacted", async () => {
  const input = fixture()
  await assert.rejects(operateScheduledTask({ ...input, owner: "another-owner", action: "tick" }), /TASK_OWNER_MISMATCH/u)
  assert.equal(taskErrorCode(new Error("token=private-value")), "TASK_EXECUTION_FAILED")
})
test("HTTP success alone never counts as delivered; signed stable delivery keys are used", async () => {
  const input = fixture(); await operateScheduledTask({ ...input, action: "tick" })
  const run = input.store.state!.history[0]
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", AMS_MONITOR_ALERT_WEBHOOK_URL: "https://example.com/authorized-alerts", AMS_MONITOR_ALERT_WEBHOOK_SECRET: "test-only-placeholder" }
  let key = ""
  const deliver = createTaskDelivery(env, (async (_url, init) => { key = new Headers(init?.headers).get("Idempotency-Key")!; assert.ok(new Headers(init?.headers).get("X-AMS-Monitor-Signature")); return Response.json({ accepted: true }) }) as typeof fetch)
  assert.equal(await deliver(run, definition), null); assert.equal(key, run.id)
  const verified = createTaskDelivery(env, (async () => Response.json({ delivered: true, deliveryId: "provider-receipt" })) as typeof fetch)
  assert.equal(await verified(run, definition), "provider-receipt")
})
