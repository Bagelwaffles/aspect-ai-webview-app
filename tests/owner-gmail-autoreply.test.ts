import test from "node:test"
import assert from "node:assert/strict"
import { beginGmailConnection, completeGmailConnection, type GmailRedis, READ_SCOPE, SEND_SCOPE } from "../lib/server/owner-gmail"
import { eligibleBusinessInquiry, maybeAutoReplyToBusinessInquiry } from "../lib/server/owner-gmail-autoreply"
import { runGmailMonitor } from "../lib/server/owner-gmail-monitor"
import { initialTaskState, scheduledTaskDefinitions } from "../lib/server/scheduled-task-engine"

const NOW = 1_790_000_000_000
const baseEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test", AMS_OWNER_EMAIL: "owner@example.com",
  AMS_GMAIL_PRIMARY_EMAIL: "business@example.com", AMS_GMAIL_SECONDARY_EMAIL: "secondary@example.com",
  AMS_GMAIL_CLIENT_ID: "client", AMS_GMAIL_CLIENT_SECRET: "not-a-real-secret",
  AMS_CONNECTION_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString("base64"),
  AMS_GMAIL_CONSENT_MODE: "testing",
  AMS_GMAIL_SEND_ENABLED: "true", AMS_GMAIL_AUTOREPLY_ENABLED: "true",
  PUBLIC_APP_URL: "https://ams.example.com",
}
function setup() {
  const values = new Map<string, string>()
  const redis: GmailRedis = {
    async get<T>(key: string) { return (values.get(key) ?? null) as T | null },
    async set(key, value, opts) {
      if (opts?.nx && values.has(key)) return null
      values.set(key, value)
      return "OK"
    },
    async eval(script, keys, args) {
      if (script.includes("redis.call('incr'")) {
        const n = Number(values.get(keys[0]) ?? "0")
        if (n >= Number(args[0])) return 0
        values.set(keys[0], String(n + 1))
        return 1
      }
      const prior = values.get(keys[0])
      values.delete(keys[0])
      return prior ?? null
    },
  }
  return { redis, values, now: NOW, env: { ...baseEnv } }
}
function headers(changes: Record<string, string> = {}) {
  const defaults = {
    From: "New Prospect <prospect@example.net>",
    To: "AMS <business@example.com>",
    Subject: "Aspect Marketing Solutions pricing question",
    "Message-ID": "<inbound-001@example.net>",
  }
  return Object.entries({ ...defaults, ...changes }).map(([name, value]) => ({ name, value }))
}
const sample = () => ({
  slot: "primary" as const, messageId: "msg-1", threadId: "thread-1",
  internalDate: NOW - 30_000, headers: headers(), token: "private-access-token",
})
function replyContext() {
  const ctx = setup()
  let sends = 0
  const raws: string[] = []
  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
    sends++
    assert.equal(init?.method, "POST")
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer private-access-token")
    const payload = JSON.parse(String(init?.body))
    assert.equal(payload.threadId, "thread-1")
    raws.push(Buffer.from(payload.raw, "base64url").toString())
    return Response.json({ id: "gmail-sent-1" })
  }) as typeof fetch
  return { ...ctx, fetcher, getSends: () => sends, getMessages: () => raws }
}
test("only an initial, directly addressed AMS human inquiry qualifies", () => {
  assert.equal(eligibleBusinessInquiry(headers(), "business@example.com", "secondary@example.com")?.recipient, "prospect@example.net")
  const rejected = [
    { Subject: "Weekend family dinner" }, { Subject: "Google Play account alert" },
    { Subject: "Aspect Marketing Solutions refund question" },
    { Subject: "Quick Marketing Audit billing question" },
    { From: "notifications@somewhere.net" },
    { From: "Business <business@example.com>" },
    { To: "secondary@example.com" },
    { "Message-ID": "broken-message-id" },
    { "Auto-Submitted": "auto-replied" },
    { Precedence: "bulk" },
    { "List-Unsubscribe": "<mailto:unsubscribe@example.com>" },
    { "List-Id": "Example list" },
    { "In-Reply-To": "<other@example.com>" },
    { "Reply-To": "other@example.net" },
    { Subject: "Re: Aspect Marketing Solutions pricing question" },
    { Subject: "Aspect Marketing Solutions pricing question\r\nCc: victim@example.net" },
  ]
  for (const changed of rejected) {
    assert.equal(eligibleBusinessInquiry(headers(changed), "business@example.com", "secondary@example.com"), null, JSON.stringify(changed))
  }
})
test("default-off and secondary account never send even with a sender token", async () => {
  const c = replyContext()
  assert.equal(await maybeAutoReplyToBusinessInquiry(sample(), { ...c, env: { ...c.env, AMS_GMAIL_AUTOREPLY_ENABLED: "false" } }), "disabled")
  assert.equal(await maybeAutoReplyToBusinessInquiry({ ...sample(), slot: "secondary" }, c), "disabled")
  assert.equal(c.getSends(), 0)
})
test("first contact receives one generic auto acknowledgement with threading and no private details", async () => {
  const c = replyContext()
  assert.equal(await maybeAutoReplyToBusinessInquiry(sample(), c), "accepted")
  assert.equal(await maybeAutoReplyToBusinessInquiry(sample(), c), "duplicate")
  assert.equal(c.getSends(), 1)
  const mime = c.getMessages()[0]
  assert.match(mime, /To: prospect@example\.net/u)
  assert.match(mime, /From: Aspect Marketing Solutions <business@example\.com>/u)
  assert.match(mime, /In-Reply-To: <inbound-001@example\.net>/u)
  assert.match(mime, /Auto-Submitted: auto-replied/u)
  assert.match(mime, /This is an automatic acknowledgement/u)
  assert.ok(!mime.includes("private-access-token"))
  assert.ok(!mime.includes("payment approved"))
})
test("a network ambiguity never retries a customer-facing message", async () => {
  const c = setup()
  let attempted = 0
  const fetcher = (async () => { attempted++; throw new Error("timeout after provider acceptance") }) as typeof fetch
  const first = await maybeAutoReplyToBusinessInquiry(sample(), { ...c, fetcher })
  const second = await maybeAutoReplyToBusinessInquiry(sample(), { ...c, fetcher })
  assert.equal(first, "unconfirmed")
  assert.equal(second, "duplicate")
  assert.equal(attempted, 1)
})
test("stale mail and missing threads are skipped without sending", async () => {
  const c = replyContext()
  assert.equal(await maybeAutoReplyToBusinessInquiry({ ...sample(), internalDate: NOW - 3 * 3600_000 }, c), "stale")
  assert.equal(await maybeAutoReplyToBusinessInquiry({ ...sample(), threadId: "" }, c), "ineligible")
  assert.equal(c.getSends(), 0)
})
test("global 20/day cap limits bulk reply storms", async () => {
  const c = replyContext()
  for (let i = 0; i < 20; i++) {
    assert.equal(await maybeAutoReplyToBusinessInquiry({ ...sample(), messageId: "msg-" + i }, c), "accepted")
  }
  assert.equal(await maybeAutoReplyToBusinessInquiry({ ...sample(), messageId: "msg-21" }, c), "rate-limited")
  assert.equal(c.getSends(), 20)
})
test("primary inbox polling safely wires one auto acknowledgement, secondary polling never does", async () => {
  const c = setup()
  const grantFetcher = (async (url: string | URL | Request) => {
    if (String(url).endsWith("/token")) return Response.json({
      access_token: "private-access-token", refresh_token: "private-refresh-token",
      expires_in: 3600, scope: [READ_SCOPE, SEND_SCOPE].join(" "),
    })
    return Response.json({ email: "business@example.com", email_verified: true })
  }) as typeof fetch
  const attempt = await beginGmailConnection("primary", "google:owner", c)
  await completeGmailConnection("primary", "google:owner", attempt.state, "code", attempt.state, { ...c, fetcher: grantFetcher })
  let sends = 0
  const fetcher = (async (url: string | URL | Request, options?: RequestInit) => {
    const value = String(url)
    if (value.endsWith("/messages/send")) {
      sends++
      assert.equal(options?.method, "POST")
      return Response.json({ id: "gmail-sent-1" })
    }
    if (value.includes("/messages/msg-one")) return Response.json({
      id: "msg-one", threadId: "thread-one", internalDate: String(NOW - 30_000),
      payload: { headers: headers() },
    })
    return Response.json({ messages: [{ id: "msg-one" }] })
  }) as typeof fetch
  const definition = scheduledTaskDefinitions.find(x => x.id === "gmail-primary-monitor")!
  const state = initialTaskState(definition, "owner", new Date(NOW))
  const result = await runGmailMonitor("primary", state, new Date(NOW), { ...c, fetcher })
  assert.equal(result.alert, true)
  assert.equal(sends, 1)
  assert.equal((result.details as { autoReply: { accepted: number } }).autoReply.accepted, 1)
  assert.ok(!JSON.stringify(result).includes("prospect@example.net"))
})
