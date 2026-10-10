import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { beginGmailConnection, completeGmailConnection, READ_SCOPE, SEND_SCOPE, type GmailRedis } from "../lib/server/owner-gmail"
import { initializeOwnerGmailCheckpoint } from "../lib/server/owner-gmail-checkpoint-initialization"
import { type TaskState, type TaskStore } from "../lib/server/scheduled-task-engine"

const now = 1_790_000_000_000
test("cold start persists one genuine checkpoint while preserving the paused task and blocking sends", async () => {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", VERCEL_ENV: "preview", AMS_OWNER_EMAIL: "owner@example.invalid", AMS_GMAIL_PRIMARY_EMAIL: "primary@example.invalid", AMS_GMAIL_SECONDARY_EMAIL: "secondary@example.invalid", AMS_GMAIL_CLIENT_ID: "client", AMS_GMAIL_CLIENT_SECRET: "secret", AMS_CONNECTION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"), AMS_GMAIL_CONSENT_MODE: "testing", PUBLIC_APP_URL: "https://preview.example.invalid", AMS_GMAIL_AUTOREPLY_ENABLED: "false" }
  const records = new Map<string, string>()
  const redis: GmailRedis = { async get<T>(key: string) { return (records.get(key) ?? null) as T | null }, async set(key, value) { records.set(key, value); return "OK" }, async eval(_script, keys) { const value = records.get(keys[0]); records.delete(keys[0]); return value ?? null } }
  for (const slot of ["primary", "secondary"] as const) {
    const attempt = await beginGmailConnection(slot, "owner-subject", { env, redis, now })
    await completeGmailConnection(slot, "owner-subject", attempt.state, "code", attempt.state, { env, redis, now, fetcher: (async url => Response.json(String(url).endsWith("/token") ? { access_token: `access-${slot}`, refresh_token: `refresh-${slot}`, expires_in: 3600, scope: [READ_SCOPE, ...(slot === "primary" ? [SEND_SCOPE] : [])].join(" ") } : { email: env[slot === "primary" ? "AMS_GMAIL_PRIMARY_EMAIL" : "AMS_GMAIL_SECONDARY_EMAIL"], email_verified: true })) as typeof fetch })
  }
  let state: TaskState | null = null
  const store: TaskStore = { async read() { return state ? structuredClone(state) : null }, async lock() { return true }, async write(_id, _lease, next) { state = structuredClone(next) }, async release() {} }
  let providerCalls = 0
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    providerCalls++
    assert.equal(init?.method ?? "GET", "GET")
    const target = new URL(String(url))
    if (target.pathname.endsWith("/messages")) return Response.json({ messages: [{ id: "message1" }] })
    return Response.json({ id: "message1", internalDate: String(now - 1_000), payload: { headers: [{ name: "Subject", value: "AMS Quick Marketing Audit inquiry" }] } })
  }) as typeof fetch
  const id = randomUUID()
  const evidence = await initializeOwnerGmailCheckpoint("primary", id, { env, redis, store, now, fetcher })
  assert.equal(evidence.status, "initialized")
  assert.equal(evidence.persisted, true)
  assert.equal(evidence.notificationSends, 0)
  assert.equal(state!.enabled, false)
  assert.equal(state!.history[0].trigger, "initialization")
  assert.equal(state!.history[0].notification, "none")
  assert.equal(state!.history[0].result?.alert, false)
  assert.equal((state!.history[0].result?.details as { checkpoint: number }).checkpoint, now)
  const calls = providerCalls
  const repeat = await initializeOwnerGmailCheckpoint("primary", randomUUID(), { env, redis, store, now, fetcher })
  assert.equal(repeat.status, "already-initialized")
  assert.equal(providerCalls, calls)
})

test("cold start rejects production, enabled tasks, and automatic replies", async () => {
  const base: NodeJS.ProcessEnv = { NODE_ENV: "test", VERCEL_ENV: "preview", AMS_OWNER_EMAIL: "owner@example.invalid", AMS_GMAIL_PRIMARY_EMAIL: "primary@example.invalid", AMS_GMAIL_SECONDARY_EMAIL: "secondary@example.invalid", AMS_GMAIL_CLIENT_ID: "client", AMS_GMAIL_CLIENT_SECRET: "secret", AMS_CONNECTION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"), AMS_GMAIL_CONSENT_MODE: "testing", PUBLIC_APP_URL: "https://preview.example.invalid", AMS_GMAIL_AUTOREPLY_ENABLED: "false" }
  const redis = { async get() { return null }, async set() { return "OK" }, async eval() { return null } } as GmailRedis
  for (const env of [{ ...base, VERCEL_ENV: "production" }, { ...base, AMS_GMAIL_AUTOREPLY_ENABLED: "true" }]) await assert.rejects(initializeOwnerGmailCheckpoint("primary", randomUUID(), { env, redis }), /GMAIL_VERIFICATION_/)
})
