import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createRequire } from "node:module"
import test from "node:test"
import { NextRequest } from "next/server"

test("refresh verification route is Preview-only, owner/origin protected and returns scoped durable evidence", async t => {
  const env = { GOOGLE_CLIENT_ID: "test-client", GOOGLE_CLIENT_SECRET: "test-secret", NEXTAUTH_SECRET: "test-session", AMS_OWNER_EMAIL: "owner@example.invalid", VERCEL_ENV: "preview", PUBLIC_APP_URL: "https://preview.example.invalid", AMS_GMAIL_PRIMARY_EMAIL: "primary@example.invalid", AMS_GMAIL_SECONDARY_EMAIL: "secondary@example.invalid", AMS_GMAIL_CLIENT_ID: "test-client", AMS_GMAIL_CLIENT_SECRET: "test-secret", AMS_CONNECTION_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString("base64"), AMS_GMAIL_CONSENT_MODE: "testing", AMS_GMAIL_AUTOREPLY_ENABLED: "false", UPSTASH_REDIS_REST_URL: "https://redis.test", UPSTASH_REDIS_REST_TOKEN: "test-redis" }
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]))
  Object.assign(process.env, env)
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value } })
  const require = createRequire(import.meta.url)
  let session: unknown = { user: { email: env.AMS_OWNER_EMAIL, customerSubject: `customer:google:${"a".repeat(64)}` } }
  t.mock.method(require("next-auth/next"), "getServerSession", async () => session)
  const data = new Map<string, string>()
  let providerCalls = 0
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    if (!String(url).startsWith("https://redis.test/")) { providerCalls++; throw new Error("No provider or sender calls expected") }
    const payload = JSON.parse(String(init?.body)), pipeline = Array.isArray(payload[0])
    const results = (pipeline ? payload : [payload]).map((command: string[]) => {
      const [operation, key, value] = command
      if (operation.toLowerCase() === "get") return { result: data.get(key) ?? null }
      if (operation.toLowerCase() === "set") {
        if (command.includes("nx") && data.has(key)) return { result: null }
        data.set(key, value); return { result: "OK" }
      }
      assert.equal(operation.toLowerCase(), "eval")
      const target = command[3]
      if (data.get(target) !== command[4]) return { result: 0 }
      data.delete(target); return { result: 1 }
    })
    return Response.json(pipeline ? results : results[0])
  })
  const { GET, POST } = await import("../app/api/owner/gmail/verify-refresh/route")
  const id = randomUUID()
  const post = (body: unknown = { slot: "secondary", requestId: id }, origin = env.PUBLIC_APP_URL) => new NextRequest(`${env.PUBLIC_APP_URL}/api/owner/gmail/verify-refresh`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const read = (slot = "secondary", requestId: string = id) => new NextRequest(`${env.PUBLIC_APP_URL}/api/owner/gmail/verify-refresh?slot=${slot}&requestId=${requestId}`)
  process.env.VERCEL_ENV = "production"
  assert.equal((await POST(post())).status, 404)
  assert.equal((await GET(read())).status, 404)
  process.env.VERCEL_ENV = "preview"
  assert.equal((await POST(post(undefined, "https://untrusted.example"))).status, 403)
  assert.equal((await POST(post({ slot: "secondary", requestId: id, forceRefresh: true }))).status, 400)
  assert.equal((await POST(post({ slot: "unknown", requestId: id }))).status, 400)
  assert.equal((await GET(read("secondary", "invalid"))).status, 400)
  session = null
  assert.equal((await POST(post())).status, 401)
  assert.equal((await GET(read())).status, 401)
  session = { user: { email: "other@example.invalid", customerSubject: `customer:google:${"b".repeat(64)}` } }
  assert.equal((await POST(post())).status, 401)
  session = { user: { email: env.AMS_OWNER_EMAIL, customerSubject: `customer:google:${"a".repeat(64)}` } }
  const response = await POST(post())
  assert.equal(response.headers.get("cache-control"), "no-store")
  const result = await response.json()
  assert.equal(result.ok, false)
  assert.equal(result.evidence.code, "GMAIL_CONNECTION_REQUIRED")
  assert.equal(result.evidence.status, "failed")
  const stored = await GET(read())
  assert.deepEqual(await stored.json(), result)
  assert.equal((await GET(read("primary"))).status, 404)
  assert.equal(providerCalls, 0)
  assert.ok(![...data.keys()].some(key => key.includes(":delivery:")))
  assert.ok(![...data.keys()].some(key => key.startsWith("ams:scheduled-tasks:") && !key.endsWith(":lock")))
  assert.ok(![...data.keys()].some(key => key.endsWith(":lock")))
})
