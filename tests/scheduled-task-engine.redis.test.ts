import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { Redis } from "@upstash/redis"
import { createScheduledTaskStore, operateScheduledTask, scheduledTaskDefinitions, scheduledTaskOwner } from "../lib/server/scheduled-task-engine"
test("isolated Redis preserves results, enforces lease fencing and prevents duplicate scheduled work", { skip: process.env.AMS_SCHEDULED_TASK_REDIS_TEST !== "true" }, async () => {
  const runKey = randomUUID()
  const env = { ...process.env, AMS_OWNER_EMAIL: `scheduled-test-${runKey}@example.invalid` }
  const store = createScheduledTaskStore(env)
  const owner = scheduledTaskOwner(env)
  const definition = { ...scheduledTaskDefinitions[0], id: `redis-acceptance-${runKey}` }
  const now = new Date("2026-10-06T13:00:00Z")
  let executions = 0
  const base = { definition, owner, store, now, worker: async () => { executions++; return { summary: "Synthetic isolated persistence test", details: { synthetic: true }, alert: false, dataQuality: "verified" as const } }, deliver: async () => null }
  const client = new Redis({ url: env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL!, token: env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN! })
  const key = `ams:scheduled-tasks:v1:${owner}:${definition.id}`
  try {
    await operateScheduledTask({ ...base, action: "resume", now: new Date("2026-10-06T12:00:00Z") })
    await operateScheduledTask({ ...base, action: "tick" })
    assert.equal((await store.read(definition.id))!.lastScheduledSuccess, now.toISOString())
    assert.equal((await operateScheduledTask({ ...base, action: "tick" })).outcome, "not-due")
    assert.equal(executions, 1)
    assert.equal(await store.lock(definition.id, "lease-current"), true)
    assert.equal(await store.lock(definition.id, "lease-other"), false)
    await assert.rejects(store.write(definition.id, "lease-other", (await store.read(definition.id))!), /TASK_LEASE_LOST/u)
    await store.release(definition.id, "lease-other")
    assert.equal(await store.lock(definition.id, "lease-new"), false)
    await store.release(definition.id, "lease-current")
  } finally { await client.del(key, `${key}:lock`) }
})
