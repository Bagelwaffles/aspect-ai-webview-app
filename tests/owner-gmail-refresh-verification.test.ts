import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { beginGmailConnection, completeGmailConnection, gmailConnectionStatus, READ_SCOPE, SEND_SCOPE, type GmailRedis } from "../lib/server/owner-gmail"
import { verifyOwnerGmailRefresh } from "../lib/server/owner-gmail-refresh-verification"
import { initialTaskState, scheduledTaskDefinitions, scheduledTaskOwner, type TaskStore, type TaskState, type TaskRun } from "../lib/server/scheduled-task-engine"

const now = 1_790_000_000_000
async function setup() {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", VERCEL_ENV: "preview", AMS_OWNER_EMAIL: "owner@example.invalid", AMS_GMAIL_PRIMARY_EMAIL: "primary@example.invalid", AMS_GMAIL_SECONDARY_EMAIL: "secondary@example.invalid", AMS_GMAIL_CLIENT_ID: "client", AMS_GMAIL_CLIENT_SECRET: "private-client-secret", AMS_CONNECTION_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString("base64"), AMS_GMAIL_CONSENT_MODE: "testing", PUBLIC_APP_URL: "https://preview.example.invalid", AMS_GMAIL_AUTOREPLY_ENABLED: "false", AMS_GMAIL_SEND_ENABLED: "true" }
  const records = new Map<string, string>()
  const redis: GmailRedis = {
    async get<T>(key: string) { return (records.get(key) ?? null) as T | null },
    async set(key, value, options) { if (options?.nx && records.has(key)) return null; records.set(key, value); return "OK" },
    async eval(_script, keys) { const record = records.get(keys[0]); records.delete(keys[0]); return record ?? null },
  }
  for (const slot of ["primary", "secondary"] as const) {
    const attempt = await beginGmailConnection(slot, "test-owner", { env, redis, now })
    await completeGmailConnection(slot, "test-owner", attempt.state, "test-code", attempt.state, {
      env, redis, now, fetcher: (async url => Response.json(String(url).endsWith("/token")
        ? { access_token: `private-original-${slot}`, refresh_token: `private-refresh-${slot}`, expires_in: 3600, scope: [READ_SCOPE, ...(slot === "primary" ? [SEND_SCOPE] : [])].join(" ") }
        : { email: env[slot === "primary" ? "AMS_GMAIL_PRIMARY_EMAIL" : "AMS_GMAIL_SECONDARY_EMAIL"], email_verified: true })) as typeof fetch,
    })
  }
  const states = new Map<string, TaskState>()
  for (const slot of ["primary", "secondary"]) {
    const definition = scheduledTaskDefinitions.find(task => task.id === `gmail-${slot}-monitor`)!
    const state = initialTaskState(definition, scheduledTaskOwner(env), new Date(now))
    state.history = [{ id: "prior", status: "succeeded", result: { summary: "prior", details: { windowStart: now - 86_400_000, windowEnd: now - 10_000, checkpoint: now - 10_000, nextPageToken: null, alerts: [] }, alert: false, dataQuality: "verified" } } as TaskRun]
    states.set(definition.id, state)
  }
  const locked = new Set<string>()
  let writes = 0, releases = 0
  const store: TaskStore = {
    async read(id) { return structuredClone(states.get(id) ?? null) },
    async lock(id) { if (locked.has(id)) return false; locked.add(id); return true },
    async write() { writes++; throw new Error("Task state must not be written") },
    async release(id) { releases++; locked.delete(id) },
  }
  return { env, redis, records, store, states, locked, getWrites: () => writes, getReleases: () => releases }
}
function monitoringFetcher(slot: "primary" | "secondary", calls: string[], empty = false) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    if (path.endsWith("/token")) {
      calls.push("refresh")
      assert.equal((init?.body as URLSearchParams).get("refresh_token"), `private-refresh-${slot}`)
      assert.equal((init?.body as URLSearchParams).get("grant_type"), "refresh_token")
      return Response.json({ access_token: `private-replacement-${slot}`, expires_in: 3600, scope: [READ_SCOPE, ...(slot === "primary" ? [SEND_SCOPE] : [])].join(" ") })
    }
    assert.equal(init?.method ?? "GET", "GET")
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer private-replacement-${slot}`)
    if (path.endsWith("/messages")) { calls.push("list"); return Response.json({ messages: empty ? [] : [{ id: "message1" }] }) }
    assert.equal(path, "/gmail/v1/users/me/messages/message1")
    calls.push("metadata")
    return Response.json({ id: "message1", internalDate: String(now + 3_599_000), payload: { headers: [{ name: "Subject", value: "PRIVATE AMS Quick Marketing Audit inquiry" }] } })
  }) as typeof fetch
}
test("both slots naturally refresh, verify encrypted readback, read/replay without task writes or sends", async () => {
  for (const slot of ["primary", "secondary"] as const) {
    const c = await setup(), calls: string[] = []
    const original = JSON.stringify([...c.states])
    const result = await verifyOwnerGmailRefresh(slot, randomUUID(), { ...c, now: now + 3_600_000, fetcher: monitoringFetcher(slot, calls) })
    assert.equal(result.status, "passed")
    assert.deepEqual(result.token, { refreshed: true, exchangeHttpStatus: 200, persisted: true, accessTokenReplaced: true, refreshTokenAvailable: true, accessTokenExpiresAt: new Date(now + 7_200_000).toISOString() })
    assert.equal(result.checkpointPreserved, true)
    assert.equal(result.otherGrantUnchanged, true)
    assert.equal(result.taskStateUnchanged, true)
    assert.equal(result.repeatedMessages, 1)
    assert.equal(result.dedupPassed, true)
    assert.equal(result.notificationSends, 0)
    assert.equal(result.automaticReplies, false)
    assert.deepEqual(calls, ["refresh", "list", "metadata", "list"])
    assert.equal(JSON.stringify([...c.states]), original)
    assert.equal(c.getWrites(), 0)
    assert.equal(c.getReleases(), 1)
    assert.ok(!JSON.stringify(result).includes("private-"))
    assert.ok(!JSON.stringify(result).includes("message1"))
    const stored = [...c.records.entries()].find(([key]) => key.includes(":refresh-verification:"))![1]
    assert.equal(stored, JSON.stringify(result))
    assert.ok(!stored.includes("PRIVATE"))
    assert.ok(!JSON.stringify([...c.records.values()]).includes("private-replacement-"))
  }
})
test("valid access token waits for natural expiry and performs no Google calls", async () => {
  const c = await setup()
  const result = await verifyOwnerGmailRefresh("secondary", randomUUID(), { ...c, now, fetcher: (async () => { throw new Error("No provider call allowed") }) as typeof fetch })
  assert.equal(result.status, "awaiting-expiry")
  assert.equal(result.token?.refreshed, false)
  assert.equal(result.token?.accessTokenExpiresAt, new Date(now + 3_600_000).toISOString())
  assert.equal(c.getWrites(), 0)
})
test("continuation cursor and enabled state survive both replay reads unchanged", async () => {
  const c = await setup(), state = c.states.get("gmail-secondary-monitor")!
  state.enabled = true
  Object.assign(state.history[0].result!.details!, { nextPageToken: "private-cursor", windowEnd: now + 3_600_000 })
  const before = JSON.stringify(state), calls: string[] = [], base = monitoringFetcher("secondary", calls)
  const fetcher = (async (url, init) => {
    const target = new URL(String(url))
    if (target.pathname.endsWith("/messages")) assert.equal(target.searchParams.get("pageToken"), "private-cursor")
    return base(url, init)
  }) as typeof fetch
  const result = await verifyOwnerGmailRefresh("secondary", randomUUID(), { ...c, now: now + 3_600_000, fetcher })
  assert.equal(result.status, "passed")
  assert.equal(JSON.stringify(c.states.get("gmail-secondary-monitor")), before)
  assert.equal(c.getWrites(), 0)
  assert.ok(!JSON.stringify(result).includes("private-cursor"))
})
test("same request returns durable evidence without refreshing twice, and busy worker is respected", async () => {
  const c = await setup(), id = randomUUID(), calls: string[] = []
  const input = { ...c, now: now + 3_600_000, fetcher: monitoringFetcher("primary", calls) }
  const first = await verifyOwnerGmailRefresh("primary", id, input)
  assert.deepEqual(await verifyOwnerGmailRefresh("primary", id, input), first)
  assert.equal(calls.filter(call => call === "refresh").length, 1)
  c.locked.add("gmail-primary-monitor")
  await assert.rejects(verifyOwnerGmailRefresh("primary", randomUUID(), input), /GMAIL_VERIFICATION_BUSY/)
})
test("empty replay cannot pass dedup acceptance and failed readback cannot claim persistence", async () => {
  const c = await setup(), calls: string[] = []
  const empty = await verifyOwnerGmailRefresh("secondary", randomUUID(), { ...c, now: now + 3_600_000, fetcher: monitoringFetcher("secondary", calls, true) })
  assert.equal(empty.status, "inconclusive")
  assert.equal(empty.dedupPassed, false)
  const d = await setup(), prior = [...d.records.entries()].find(([key]) => key.endsWith(":primary"))!
  const redis = { ...d.redis, async get<T>(key: string) { return (key === prior[0] ? prior[1] : await d.redis.get(key)) as T | null } }
  const failed = await verifyOwnerGmailRefresh("primary", randomUUID(), { ...d, redis, now: now + 3_600_000, fetcher: monitoringFetcher("primary", []) })
  assert.equal(failed.status, "failed")
  assert.equal(failed.token?.persisted, false)
  assert.equal(failed.code, "GMAIL_VERIFICATION_PERSISTENCE_FAILED")
})
test("refresh rejection affects only the selected grant, releases lock and returns no provider text", async t => {
  t.mock.method(console, "warn", () => {})
  for (const slot of ["primary", "secondary"] as const) {
    const c = await setup(), other = slot === "primary" ? "secondary" : "primary"
    const otherRecord = [...c.records.entries()].find(([key]) => key.endsWith(`:${other}`))!
    const result = await verifyOwnerGmailRefresh(slot, randomUUID(), { ...c, now: now + 3_600_000, fetcher: (async () => Response.json({ error: "invalid_grant", error_description: "PRIVATE_REFRESH" }, { status: 400 })) as typeof fetch })
    assert.equal(result.status, "failed")
    assert.equal(result.code, "GMAIL_REAUTHORIZE_REQUIRED")
    assert.equal(result.otherGrantUnchanged, true)
    assert.equal(c.records.get(otherRecord[0]), otherRecord[1])
    assert.equal((await gmailConnectionStatus(other, { ...c, now: now + 3_600_000 })).connected, true)
    assert.equal((await gmailConnectionStatus(slot, { ...c, now: now + 3_600_000 })).connected, false)
    assert.ok(!JSON.stringify(result).includes("PRIVATE"))
    assert.equal(c.getWrites(), 0)
    assert.equal(c.getReleases(), 1)
  }
})
test("production and enabled automatic replies are rejected before any token operation", async () => {
  const c = await setup()
  for (const env of [{ ...c.env, VERCEL_ENV: "production" }, { ...c.env, AMS_GMAIL_AUTOREPLY_ENABLED: "true" }]) {
    await assert.rejects(verifyOwnerGmailRefresh("primary", randomUUID(), { ...c, env }), /GMAIL_VERIFICATION_/)
  }
  assert.equal(c.getReleases(), 0)
})
