import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { Redis } from "@upstash/redis"
import { createScheduledTaskStore, operateScheduledTask, scheduledTaskDefinitions, scheduledTaskOwner } from "../lib/server/scheduled-task-engine"
test("isolated Redis preserves results, enforces lease fencing and prevents duplicate scheduled work", { skip: process.env.AMS_SCHEDULED_TASK_REDIS_TEST !== "true" }, async () => {
  const runKey = randomUUID()
  const env: NodeJS.ProcessEnv = { ...process.env, AMS_OWNER_EMAIL: `scheduled-test-${runKey}@example.invalid` }
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

test("isolated Redis stores encrypted Gmail slots and consumes OAuth state exactly once", { skip: process.env.AMS_SCHEDULED_TASK_REDIS_TEST !== "true" }, async () => {
  const { createHash } = await import("node:crypto")
  const { beginGmailConnection, completeGmailConnection, gmailAccessToken, READ_SCOPE, SEND_SCOPE } = await import("../lib/server/owner-gmail")
  const runKey = randomUUID()
  const env: NodeJS.ProcessEnv = { ...process.env, AMS_OWNER_EMAIL: `gmail-test-${runKey}@example.invalid`, AMS_GMAIL_PRIMARY_EMAIL: "primary@example.invalid", AMS_GMAIL_SECONDARY_EMAIL: "secondary@example.invalid", AMS_GMAIL_CLIENT_ID: "synthetic-client", AMS_GMAIL_CLIENT_SECRET: "synthetic-secret", AMS_GMAIL_CONSENT_MODE: "testing", AMS_CONNECTION_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString("base64"), PUBLIC_APP_URL: "https://synthetic.example.invalid", VERCEL_ENV: "preview" }
  const redis = new Redis({ url: env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL!, token: env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN! })
  const owner = createHash("sha256").update(env.AMS_OWNER_EMAIL!).digest("hex")
  const prefix = `ams:owner-gmail:v1:${owner}:`
  const cleanup = [`${prefix}primary`, `${prefix}secondary`]
  try {
    for (const slot of ["primary", "secondary"] as const) {
      const attempt = await beginGmailConnection(slot, "google:synthetic-owner", { env })
      cleanup.push(`${prefix}oauth:${attempt.state}`)
      const fetcher = (async (url: string | URL | Request) => Response.json(String(url).endsWith("/token") ? { access_token: `synthetic-${slot}`, refresh_token: `synthetic-refresh-${slot}`, expires_in: 3600, scope: [READ_SCOPE, ...(slot === "primary" ? [SEND_SCOPE] : [])].join(" ") } : { email: `${slot}@example.invalid`, email_verified: true })) as typeof fetch
      await completeGmailConnection(slot, "google:synthetic-owner", attempt.state, "synthetic-code", attempt.state, { env, fetcher })
      assert.equal(await gmailAccessToken(slot, { env }), `synthetic-${slot}`)
      assert.ok(!JSON.stringify(await redis.get(`${prefix}${slot}`)).includes(`synthetic-refresh-${slot}`))
      await assert.rejects(completeGmailConnection(slot, "google:synthetic-owner", attempt.state, "synthetic-code", attempt.state, { env, fetcher }), /GMAIL_STATE_INVALID/u)
    }
  } finally { await redis.del(...cleanup) }
})
