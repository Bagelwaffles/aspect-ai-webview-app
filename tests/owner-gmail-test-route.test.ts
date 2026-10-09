import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"
import { NextRequest } from "next/server"

test("owner test route enforces sender opt-in and preserves private provider diagnostics", async t => {
  const env = {
    GOOGLE_CLIENT_ID: "test-client", GOOGLE_CLIENT_SECRET: "test-secret", NEXTAUTH_SECRET: "test-session-secret",
    AMS_OWNER_EMAIL: "owner@example.com", AMS_GMAIL_PRIMARY_EMAIL: "primary@example.com", AMS_GMAIL_SECONDARY_EMAIL: "secondary@example.com",
    AMS_GMAIL_CLIENT_ID: "test-gmail-client", AMS_GMAIL_CLIENT_SECRET: "test-gmail-secret",
    AMS_CONNECTION_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64"),
    PUBLIC_APP_URL: "https://ams.example.com", VERCEL_ENV: "preview", AMS_GMAIL_CONSENT_MODE: "testing",
    AMS_MONITOR_ALERT_WEBHOOK_URL: "https://ams.example.com/api/internal/monitoring/email", AMS_MONITOR_ALERT_WEBHOOK_SECRET: "test-signature-secret",
    AMS_GMAIL_SEND_ENABLED: "false", AMS_GMAIL_AUTOREPLY_ENABLED: "false",
    UPSTASH_REDIS_REST_URL: "https://redis.test", UPSTASH_REDIS_REST_TOKEN: "test-redis-token",
  }
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]))
  Object.assign(process.env, env)
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  // Mock the session provider, not the route's owner/origin authorization.
  const require = createRequire(import.meta.url)
  const nextAuth = require("next-auth/next")
  let session: unknown = { user: { email: env.AMS_OWNER_EMAIL, customerSubject: `customer:google:${"a".repeat(64)}` } }
  t.mock.method(nextAuth, "getServerSession", async () => session)
  const records = new Map<string, string>()
  let gmailCalls = 0
  const gmailResponse = Response.json({ error: { message: "PRIVATE_ACCESS primary@example.com", errors: [{ reason: "accessNotConfigured" }] } }, { status: 403 })
  const logs: unknown[][] = []
  t.mock.method(console, "warn", (...args: unknown[]) => { logs.push(args) })
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, options?: RequestInit) => {
    if (!String(url).startsWith("https://redis.test/")) {
      gmailCalls++
      if (String(url).endsWith("/messages/send")) return gmailResponse.clone()
      throw new Error("Gmail and self-HTTP must not be called")
    }
    const payload = JSON.parse(String(options?.body))
    const pipeline = Array.isArray(payload[0])
    const results = (pipeline ? payload : [payload]).map((command: string[]) => {
      const [operation, key, value] = command
      if (operation.toLowerCase() === "get") return { result: records.get(key) ?? null }
      assert.equal(operation.toLowerCase(), "set")
      records.set(key, value)
      return { result: "OK" }
    })
    return Response.json(pipeline ? results : results[0])
  })
  const { POST } = await import("../app/api/owner/gmail/test/route")
  const id = "a22b4bba-2fc3-4124-a312-1a4e82f8a430"
  const request = (origin = env.PUBLIC_APP_URL, requestId = id) => new NextRequest(`${env.PUBLIC_APP_URL}/api/owner/gmail/test`, {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ requestId }),
  })
  const response = await POST(request())
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { ok: false, code: "GMAIL_SEND_DISABLED" })
  assert.equal(response.headers.get("cache-control"), "no-store")
  const stored = [...records.values()].map(value => JSON.parse(value))
  assert.deepEqual(stored.map(value => ({ id: value.id, status: value.status, code: value.code })), [{ id, status: "unconfirmed", code: "GMAIL_SEND_DISABLED" }])
  assert.ok(![...records.keys()].some(key => key.includes(":delivery:")))
  assert.equal(gmailCalls, 0)
  assert.equal((await POST(request("https://untrusted.example"))).status, 403)
  assert.equal((await POST(request(env.PUBLIC_APP_URL, "invalid"))).status, 400)

  // Seed a synthetic owner grant via the actual PKCE/identity/storage path.
  const { beginGmailConnection, completeGmailConnection, READ_SCOPE, SEND_SCOPE } = await import("../lib/server/owner-gmail")
  const context = { env: process.env, redis: {
    async get<T>(key: string) { return (records.get(key) ?? null) as T | null },
    async set(key: string, value: string) { records.set(key, value); return "OK" },
    async eval(_script: string, keys: string[]) { const value = records.get(keys[0]); records.delete(keys[0]); return value ?? null },
  } }
  const attempt = await beginGmailConnection("primary", "test-owner", context)
  await completeGmailConnection("primary", "test-owner", attempt.state, "test-code", attempt.state, {
    ...context, fetcher: (async (url: string | URL | Request) => Response.json(String(url).endsWith("/token")
      ? { access_token: "PRIVATE_ACCESS", refresh_token: "PRIVATE_REFRESH", expires_in: 3600, scope: `${READ_SCOPE} ${SEND_SCOPE}` }
      : { email: env.AMS_GMAIL_PRIMARY_EMAIL, email_verified: true })) as typeof fetch,
  })
  process.env.AMS_GMAIL_SEND_ENABLED = "true"
  const failure = await POST(request())
  const diagnostic = { operation: "send", httpStatus: 403, reason: "accessNotConfigured", category: "api-configuration" }
  assert.equal(failure.status, 503)
  assert.deepEqual(await failure.json(), { ok: false, code: "GMAIL_SEND_UNCONFIRMED", diagnostic })
  const persisted = [...records.values()].map(value => JSON.parse(value)).find(value => value.id === id)
  assert.deepEqual(persisted.diagnostic, diagnostic)
  assert.ok([...records.keys()].some(key => key.includes(":delivery:")))
  assert.equal(gmailCalls, 1)
  assert.equal(process.env.AMS_GMAIL_AUTOREPLY_ENABLED, "false")
  assert.ok(!JSON.stringify(logs).includes("PRIVATE_ACCESS"))
  assert.ok(!JSON.stringify(logs).includes("primary@example.com"))
  session = null
  assert.equal((await POST(request())).status, 401)
})
