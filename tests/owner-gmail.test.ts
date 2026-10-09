import test from "node:test"
import assert from "node:assert/strict"
import { beginGmailConnection, completeGmailConnection, gmailAccessToken, gmailConnectionStatus, gmailConfig, READ_SCOPE, SEND_SCOPE, type GmailRedis } from "../lib/server/owner-gmail"
import { classifyGmailMetadata, runGmailMonitor } from "../lib/server/owner-gmail-monitor"
import { deliverGmailAlert, verifyMonitorSignature } from "../lib/server/owner-gmail-delivery"
import { createHmac, createHash } from "node:crypto"
import { createTaskDelivery, initialTaskState, scheduledTaskDefinitions, type TaskRun } from "../lib/server/scheduled-task-engine"
import { gmailCallbackFailure, gmailConnectionFeedback, gmailTestFailure, gmailTestDeliveryFeedback } from "../lib/gmail-connection-feedback"
const env: NodeJS.ProcessEnv = { NODE_ENV: "test", AMS_OWNER_EMAIL: "owner@example.com", AMS_GMAIL_PRIMARY_EMAIL: "business@example.com", AMS_GMAIL_SECONDARY_EMAIL: "second@example.com", AMS_GMAIL_CLIENT_ID: "client", AMS_GMAIL_CLIENT_SECRET: "secret", AMS_CONNECTION_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64"), PUBLIC_APP_URL: "https://ams.example.com", AMS_GMAIL_CONSENT_MODE: "testing", AMS_GMAIL_SEND_ENABLED: "true" }
function setup() {
  const data = new Map<string, string>()
  const redis: GmailRedis = { async get<T>(key: string) { return (data.get(key) ?? null) as T | null }, async set(key, value, opts) { if (opts?.nx && data.has(key)) return null; data.set(key, value); return "OK" }, async eval(_script, keys) { const raw = data.get(keys[0]); data.delete(keys[0]); return raw ?? null } }
  return { data, redis, env, now: 1_790_000_000_000 }
}
function grantFetcher(email: string, scopes: string[], calls: string[] = []) {
  return (async (url: string | URL | Request) => { calls.push(String(url)); return Response.json(String(url).endsWith("/token") ? { access_token: "private-access", refresh_token: "private-refresh", expires_in: 3600, scope: scopes.join(" ") } : { email, email_verified: true }) }) as typeof fetch
}
async function connect(slot: "primary" | "secondary", c: ReturnType<typeof setup>) {
  const attempt = await beginGmailConnection(slot, "google:owner", c)
  await completeGmailConnection(slot, "google:owner", attempt.state, "code", attempt.state, { ...c, fetcher: grantFetcher(slot === "primary" ? env.AMS_GMAIL_PRIMARY_EMAIL! : env.AMS_GMAIL_SECONDARY_EMAIL!, [READ_SCOPE, ...(slot === "primary" ? [SEND_SCOPE] : [])]) })
  return attempt
}
test("separate PKCE requests use exact callbacks and minimum account scopes", async () => {
  const c = setup(), first = await beginGmailConnection("primary", "google:owner", c), second = await beginGmailConnection("secondary", "google:owner", c)
  const a = new URL(first.url), b = new URL(second.url)
  assert.notEqual(first.state, second.state); assert.equal(a.searchParams.get("code_challenge_method"), "S256")
  assert.equal(a.searchParams.get("redirect_uri"), "https://ams.example.com/api/owner/gmail/primary/callback")
  assert.equal(b.searchParams.get("redirect_uri"), "https://ams.example.com/api/owner/gmail/secondary/callback")
  assert.ok(a.searchParams.get("scope")?.includes(SEND_SCOPE)); assert.ok(!b.searchParams.get("scope")?.includes(SEND_SCOPE))
  assert.equal(a.searchParams.get("include_granted_scopes"), "false")
  assert.ok(!JSON.stringify([...c.data.values()]).includes("google:owner"))
})
test("encrypted records are independent, secrets never appear in status, testing expires", async () => {
  const c = setup(); await connect("primary", c); await connect("secondary", c)
  const raw = JSON.stringify([...c.data.values()]); assert.ok(!raw.includes("private-access")); assert.ok(!raw.includes("private-refresh"))
  assert.equal(await gmailAccessToken("secondary", c), "private-access")
  const status = await gmailConnectionStatus("primary", c); assert.equal(status.testing, true); assert.ok(!JSON.stringify(status).includes("private"))
  await assert.rejects(gmailAccessToken("primary", { ...c, now: c.now + 7 * 86400_000 }), /REAUTHORIZE/)
  assert.equal((await gmailConnectionStatus("secondary", c)).status, "connected")
})
test("expired OAuth grants explicitly require reauthorization without conflating configuration changes", async () => {
  const c = setup()
  await connect("primary", c)
  const before = await gmailConnectionStatus("primary", c)
  assert.equal(before.status, "connected")
  assert.equal(before.connected, true)

  const afterExpiry = await gmailConnectionStatus("primary", { ...c, now: c.now + 7 * 86400_000 })
  assert.equal(afterExpiry.status, "reauthorize")
  assert.equal(afterExpiry.connected, false)
  assert.equal(afterExpiry.testing, true)

  const changed = await gmailConnectionStatus("primary", {
    ...c, env: { ...env, AMS_GMAIL_PRIMARY_EMAIL: "changed@example.com" },
  })
  assert.equal(changed.status, "configuration-changed")
  assert.equal(changed.connected, false)
})

test("state is bound to owner/account/cookie, expires and cannot replay", async () => {
  const c = setup(), attempt = await connect("primary", c)
  await assert.rejects(completeGmailConnection("primary", "google:owner", attempt.state, "code", attempt.state, c), /STATE_INVALID/)
  const other = await beginGmailConnection("secondary", "google:owner", c)
  await assert.rejects(completeGmailConnection("primary", "google:owner", other.state, "code", other.state, c), /STATE_INVALID/)
  const expired = await beginGmailConnection("primary", "google:owner", c)
  await assert.rejects(completeGmailConnection("primary", "google:other", expired.state, "code", expired.state, c), /STATE_INVALID/)
  const aged = await beginGmailConnection("primary", "google:owner", c)
  await assert.rejects(completeGmailConnection("primary", "google:owner", aged.state, "code", aged.state, { ...c, now: c.now + 600_001 }), /STATE_INVALID/)
})
test("wrong identity, missing scopes, extra scope and missing offline grant fail closed", async () => {
  for (const [email, scopes, expected] of [["wrong@example.com", [READ_SCOPE, SEND_SCOPE], /ACCOUNT_MISMATCH/], [env.AMS_GMAIL_PRIMARY_EMAIL, [READ_SCOPE], /SCOPE_INVALID/], [env.AMS_GMAIL_SECONDARY_EMAIL, [READ_SCOPE, SEND_SCOPE], /SCOPE_INVALID/]] as const) {
    const c = setup(), slot = scopes.length === 2 && email === env.AMS_GMAIL_SECONDARY_EMAIL ? "secondary" : "primary", a = await beginGmailConnection(slot, "google:owner", c)
    await assert.rejects(completeGmailConnection(slot, "google:owner", a.state, "code", a.state, { ...c, fetcher: grantFetcher(email!, [...scopes]) }), expected)
    assert.equal((await gmailConnectionStatus(slot, c)).connected, false)
  }
})
test("consent policy and distinct account configuration are required", () => {
  assert.throws(() => gmailConfig("primary", { ...env, AMS_GMAIL_CONSENT_MODE: "production" }), /CONFIG_REQUIRED/)
  assert.throws(() => gmailConfig("secondary", { ...env, AMS_GMAIL_SECONDARY_EMAIL: env.AMS_GMAIL_PRIMARY_EMAIL }), /CONFIG_REQUIRED/)
  assert.throws(() => gmailConfig("primary", { ...env, PUBLIC_APP_URL: "http://ams.example.com" }), /CONFIG_REQUIRED/)
})
test("business classification excludes unrelated personal metadata", () => {
  assert.equal(classifyGmailMetadata([{ name: "Subject", value: "Family dinner" }, { name: "From", value: "friend@example.com" }]), null)
  assert.equal(classifyGmailMetadata([{ name: "Subject", value: "AMS Quick Marketing Audit paid order" }]), "payment")
  assert.equal(classifyGmailMetadata([{ name: "Subject", value: "Google Play review update" }]), "google-play")
})
test("monitor retrieves metadata only, isolates discoveries and preserves pagination", async () => {
  const c = setup(); await connect("secondary", c)
  const definition = scheduledTaskDefinitions.find(d => d.id === "gmail-secondary-monitor")!, state = initialTaskState(definition, "owner", new Date(c.now))
  const urls: string[] = []
  const fetcher = (async (url: string | URL | Request, opts?: RequestInit) => {
    urls.push(String(url)); assert.ok(!opts?.method || opts.method === "GET")
    return Response.json(String(url).includes("/messages/m1") ? { id: "m1", internalDate: String(c.now - 1000), payload: { headers: [{ name: "Subject", value: "Quick Marketing Audit order" }] } } : { messages: [{ id: "m1" }], nextPageToken: "page-two" })
  }) as typeof fetch
  const result = await runGmailMonitor("secondary", state, new Date(c.now), { ...c, fetcher })
  assert.equal(result.alert, true); assert.equal(result.dataQuality, "partial"); assert.ok(urls[1].includes("format=metadata"))
  assert.ok(!JSON.stringify(result).includes("Quick Marketing Audit order")); assert.ok(result.discoveries?.[0].startsWith("gmail:secondary:"))
  state.findings = result.discoveries!; urls.length = 0
  const duplicate = await runGmailMonitor("secondary", state, new Date(c.now), { ...c, fetcher })
  assert.equal(duplicate.alert, false); assert.equal(urls.length, 1)
})
test("signed alerts require valid HMAC and exact idempotency", () => {
  const body = "test", secret = "test-key", signature = createHmac("sha256", secret).update(body).digest("hex")
  assert.equal(verifyMonitorSignature(body, signature, secret), true)
  assert.equal(verifyMonitorSignature(body + "changed", signature, secret), false)
  assert.equal(verifyMonitorSignature(body, null, secret), false)
})
test("notification retries reconcile receipt without duplicate send or private content", async () => {
  const c = setup(); await connect("primary", c)
  let sends = 0, delivered = false
  const fetcher = (async (url: string | URL | Request, opts?: RequestInit) => {
    if (String(url).endsWith("/send")) { sends++; const content = Buffer.from(JSON.parse(String(opts?.body)).raw, "base64url").toString(); assert.ok(!content.includes("PRIVATE")); assert.ok(content.includes(`To: ${env.AMS_GMAIL_PRIMARY_EMAIL}`)); return Response.json({ id: "sent1" }) }
    return Response.json({ messages: delivered ? [{ id: "inbox1" }] : [] })
  }) as typeof fetch
  const event = { source: "ams-scheduled-tasks", id: "c072b2df-02dd-43a0-97f5-4f8b03d684ab", task: "PRIVATE", createdAt: null, severity: "actionable", summary: "PRIVATE", details: { body: "PRIVATE" } }
  assert.equal((await deliverGmailAlert(event, event.id, { ...c, fetcher })).delivered, false)
  assert.equal((await deliverGmailAlert(event, event.id, { ...c, fetcher })).delivered, false); assert.equal(sends, 1)
  delivered = true
  assert.deepEqual(await deliverGmailAlert(event, event.id, { ...c, fetcher }), { delivered: true, deliveryId: "gmail:inbox1" })
  assert.equal(sends, 1)
})
test("testing is prohibited on production and owner-use requires explicit policy approval", () => {
  assert.throws(() => gmailConfig("primary", { ...env, VERCEL_ENV: "production" }), /PRODUCTION_CONSENT_REQUIRED/)
  assert.throws(() => gmailConfig("primary", { ...env, AMS_GMAIL_CONSENT_MODE: "approved-owner-use" }), /CONFIG_REQUIRED/)
  assert.equal(gmailConfig("primary", { ...env, AMS_GMAIL_CONSENT_MODE: "approved-owner-use", AMS_GMAIL_POLICY_APPROVED: "true" }).mode, "approved-owner-use")
})
test("refresh rejection and configuration identity changes fail closed", async () => {
  const c = setup(); await connect("primary", c)
  await assert.rejects(gmailAccessToken("primary", { ...c, env: { ...env, AMS_GMAIL_PRIMARY_EMAIL: "changed@example.com" } }), /REAUTHORIZE/)
  await assert.rejects(gmailAccessToken("primary", { ...c, now: c.now + 3_600_000, fetcher: (async () => Response.json({ error: "invalid_grant" }, { status: 400 })) as typeof fetch }), /REAUTHORIZE/)
})
test("revoked refresh grant persists reauthorization only for that account", async () => {
  const c = setup(); await connect("primary", c); await connect("secondary", c)
  const later = { ...c, now: c.now + 3_600_000, fetcher: (async () => Response.json({ error: "invalid_grant", error_description: "PRIVATE" }, { status: 400 })) as typeof fetch }
  await assert.rejects(gmailAccessToken("primary", later), /GMAIL_REAUTHORIZE_REQUIRED/)
  assert.equal((await gmailConnectionStatus("primary", later)).status, "reauthorize")
  assert.equal((await gmailConnectionStatus("secondary", later)).status, "connected")
  assert.ok(!JSON.stringify([...c.data.values()]).includes("PRIVATE"))
})
test("configuration and temporary refresh failures leave grants intact", async () => {
  for (const [providerError, code] of [["invalid_client", "GMAIL_CONFIG_REQUIRED"], ["temporarily_unavailable", "GMAIL_TOKEN_UNAVAILABLE"]]) {
    const c = setup(); await connect("primary", c)
    const later = { ...c, now: c.now + 3_600_000, fetcher: (async () => Response.json({ error: providerError, error_description: "PRIVATE" }, { status: 400 })) as typeof fetch }
    await assert.rejects(gmailAccessToken("primary", later), { message: code })
    assert.equal((await gmailConnectionStatus("primary", later)).status, "connected")
  }
})
test("refresh preserves offline token and accepts independently rotated access tokens", async () => {
  const c = setup(); await connect("secondary", c)
  let refreshes = 0
  const later = { ...c, now: c.now + 3_600_000, fetcher: (async (_url, options) => {
    refreshes++
    assert.equal((options?.body as URLSearchParams).get("refresh_token"), "private-refresh")
    return Response.json({ access_token: `rotated-${refreshes}`, expires_in: 3600, scope: READ_SCOPE })
  }) as typeof fetch }
  assert.equal(await gmailAccessToken("secondary", later), "rotated-1")
  assert.equal(await gmailAccessToken("secondary", { ...later, now: later.now + 3_600_000 }), "rotated-2")
})
test("callback feedback allowlist never exposes provider text or secrets", () => {
  assert.equal(gmailCallbackFailure(new Error("GMAIL_ACCOUNT_MISMATCH")), "account-mismatch")
  assert.equal(gmailCallbackFailure(new Error("GMAIL_STATE_INVALID")), "state-invalid")
  assert.equal(gmailCallbackFailure(new Error("GMAIL_OFFLINE_GRANT_REQUIRED")), "offline-grant-required")
  assert.equal(gmailCallbackFailure(new Error("PRIVATE token=secret")), "connection-failed")
  assert.ok(!JSON.stringify(gmailConnectionFeedback).includes("PRIVATE"))
})
test("ambiguous send does not resend on retry; sender opt-in and idempotency are enforced", async () => {
  const c = setup(); await connect("primary", c)
  let sends = 0
  const fetcher = (async (url: string | URL | Request) => { if (String(url).endsWith("/send")) { sends++; throw new Error("network ambiguity") } return Response.json({ messages: [] }) }) as typeof fetch
  const event = { source: "ams-scheduled-tasks", id: "de4c653d-6632-4e31-a1c1-fb22437022b6", task: "Test", createdAt: null, severity: "critical", summary: null, details: null }
  await assert.rejects(deliverGmailAlert(event, "wrong", { ...c, fetcher }), /ID_INVALID/)
  await assert.rejects(deliverGmailAlert(event, event.id, { ...c, env: { ...env, AMS_GMAIL_SEND_ENABLED: "false" }, fetcher }), /SEND_DISABLED/)
  await assert.rejects(deliverGmailAlert(event, event.id, { ...c, fetcher }))
  assert.equal((await deliverGmailAlert(event, event.id, { ...c, fetcher })).delivered, false); assert.equal(sends, 1)
})
test("connected Gmail accounts do not enable owner alerts in a sender-disabled preview", async () => {
  const c = setup(); await connect("primary", c); await connect("secondary", c)
  const disabled = { ...c, env: { ...env, VERCEL_ENV: "preview", AMS_GMAIL_SEND_ENABLED: "false", AMS_GMAIL_AUTOREPLY_ENABLED: "false" } }
  assert.equal((await gmailConnectionStatus("primary", disabled)).connected, true)
  assert.equal((await gmailConnectionStatus("secondary", disabled)).connected, true)
  let calls = 0
  const event = { source: "ams-scheduled-tasks", id: "a22b4bba-2fc3-4124-a312-1a4e82f8a430", task: "Owner notification test", createdAt: null, severity: "actionable", summary: null, details: null }
  await assert.rejects(deliverGmailAlert(event, event.id, {
    ...disabled, now: c.now + 3_600_000,
    fetcher: (async () => { calls++; throw new Error("No token refresh or Gmail call is allowed") }) as typeof fetch,
  }), error => {
    assert.equal(gmailTestFailure(error), "GMAIL_SEND_DISABLED")
    assert.match(gmailTestDeliveryFeedback(gmailTestFailure(error)), /disabled.*deployment.*READY/u)
    return true
  })
  assert.equal(calls, 0)
  assert.ok(![...c.data.keys()].some(key => key.includes(":delivery:")))
})
test("owner test failures preserve actionable codes without exposing arbitrary exceptions", () => {
  for (const code of ["GMAIL_REAUTHORIZE_REQUIRED", "GMAIL_CONFIG_REQUIRED", "GMAIL_TOKEN_UNAVAILABLE", "GMAIL_RECEIPT_UNAVAILABLE", "GMAIL_SEND_UNCONFIRMED"]) {
    assert.equal(gmailTestFailure(new Error(code)), code)
    assert.notEqual(gmailTestDeliveryFeedback(code), gmailTestDeliveryFeedback(undefined))
  }
  for (const error of [new Error("PRIVATE_TOKEN"), new Error("provider error token=PRIVATE"), "GMAIL_SEND_DISABLED", null]) {
    assert.equal(gmailTestFailure(error), "GMAIL_TEST_UNCONFIRMED")
  }
  for (const code of ["PRIVATE_TOKEN", "toString", "__proto__", null, {}]) {
    assert.equal(gmailTestDeliveryFeedback(code), gmailTestDeliveryFeedback(undefined))
  }
})
test("personal Stripe receipt is discarded unless owner explicitly opts in a business term", () => {
  const headers = [{ name: "Subject", value: "Stripe personal purchase receipt" }]
  assert.equal(classifyGmailMetadata(headers), null)
  assert.equal(classifyGmailMetadata([{ name: "Subject", value: "Example Business customer inquiry" }], ["Example Business"]), "customer")
})

test("scheduled SHA-256 execution identifiers are accepted through the signed delivery transport", async () => {
  const c = setup()
  await connect("primary", c)
  const runId = createHash("sha256").update("owner:ai-platform-intelligence:2026-10-07:1").digest("hex")
  let sends = 0
  const gmailFetcher = (async (url: string | URL | Request) => {
    if (String(url).endsWith("/send")) {
      sends++
      return Response.json({ id: "sent1" })
    }
    return Response.json({ messages: [{ id: "inbox1" }] })
  }) as typeof fetch
  const webhookFetcher = (async (url: string | URL | Request, options?: RequestInit) => {
    assert.equal(String(url), "https://ams.example.com/api/internal/monitoring/email")
    const body = String(options?.body)
    assert.equal(verifyMonitorSignature(body, new Headers(options?.headers).get("X-AMS-Monitor-Signature"), "signed-secret"), true)
    const event = JSON.parse(body)
    assert.equal(event.id, runId)
    const delivered = await deliverGmailAlert(event, new Headers(options?.headers).get("Idempotency-Key"), { ...c, fetcher: gmailFetcher })
    return Response.json(delivered)
  }) as typeof fetch
  const deliver = createTaskDelivery({
    ...env,
    AMS_MONITOR_ALERT_WEBHOOK_URL: "https://ams.example.com/api/internal/monitoring/email",
    AMS_MONITOR_ALERT_WEBHOOK_SECRET: "signed-secret",
  }, webhookFetcher)
  const run: TaskRun = {
    id: runId, trigger: "scheduled", scheduledFor: "2026-10-07T13:00:00.000Z",
    startedAt: "2026-10-07T13:00:00.000Z", finishedAt: "2026-10-07T13:00:01.000Z",
    status: "succeeded", attempt: 1, error: null,
    result: { summary: "One new finding", details: {}, alert: true, dataQuality: "verified" },
    notification: "pending", deliveryAttempts: 0, nextDeliveryAt: null, deliveryReceipt: null,
  }
  assert.equal(await deliver(run, scheduledTaskDefinitions[0]), "gmail:inbox1")
  assert.equal(await deliver(run, scheduledTaskDefinitions[0]), "gmail:inbox1")
  assert.equal(sends, 1)
})

test("protected preview uses strictly same-origin Gmail delivery without calling Vercel authentication", async () => {
  const id = createHash("sha256").update("ams-preview-alert-id").digest("hex")
  const run: TaskRun = {
    id, trigger: "scheduled", scheduledFor: "2026-10-07T13:00:00.000Z",
    startedAt: "2026-10-07T13:00:00.000Z", finishedAt: "2026-10-07T13:00:01.000Z",
    status: "succeeded", attempt: 1, error: null,
    result: { summary: "Owner review required", details: null, alert: true, dataQuality: "verified" },
    notification: "pending", deliveryAttempts: 0, nextDeliveryAt: null, deliveryReceipt: null,
  }
  let directCalls = 0, httpCalls = 0
  const fetcher = (async () => { httpCalls++; throw new Error("Protected preview HTTP must not be requested") }) as typeof fetch
  const localDeliver = async (event: unknown, key: string | null) => {
    directCalls++
    assert.equal((event as { id: string }).id, id)
    assert.equal(key, id)
    return { delivered: true, deliveryId: "gmail:preview-inbox" }
  }
  const sameOrigin = createTaskDelivery({
    ...env, VERCEL_ENV: "preview",
    AMS_MONITOR_ALERT_WEBHOOK_URL: "https://ams.example.com/api/internal/monitoring/email",
    AMS_MONITOR_ALERT_WEBHOOK_SECRET: "signature-secret",
    AMS_GMAIL_SEND_ENABLED: "true",
  }, fetcher, localDeliver)
  assert.equal(await sameOrigin(run, scheduledTaskDefinitions[0]), "gmail:preview-inbox")
  assert.equal(directCalls, 1)
  assert.equal(httpCalls, 0)

  const unsafeTarget = createTaskDelivery({
    ...env, VERCEL_ENV: "preview",
    AMS_MONITOR_ALERT_WEBHOOK_URL: "https://ams.example.com/api/internal/monitoring/email?different=1",
    AMS_MONITOR_ALERT_WEBHOOK_SECRET: "signature-secret",
    AMS_GMAIL_SEND_ENABLED: "true",
  }, fetcher, localDeliver)
  await assert.rejects(unsafeTarget(run, scheduledTaskDefinitions[0]), /Protected preview HTTP/)
  assert.equal(directCalls, 1)

  const notOptedIn = createTaskDelivery({
    ...env, VERCEL_ENV: "preview",
    AMS_MONITOR_ALERT_WEBHOOK_URL: "https://ams.example.com/api/internal/monitoring/email",
    AMS_MONITOR_ALERT_WEBHOOK_SECRET: "signature-secret",
    AMS_GMAIL_SEND_ENABLED: "false",
  }, fetcher, localDeliver)
  await assert.rejects(notOptedIn(run, scheduledTaskDefinitions[0]), /Protected preview HTTP/)
  assert.equal(directCalls, 1)
})
