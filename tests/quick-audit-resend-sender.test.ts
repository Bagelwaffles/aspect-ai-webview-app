import { test } from "node:test"
import assert from "node:assert/strict"

import { createResendAuditSender } from "../lib/server/quick-audit-resend-sender"
import {
  AMS_CUSTOMER_FROM_ADDRESS,
  AMS_CUSTOMER_FROM_NAME,
} from "../lib/server/quick-audit-delivery-worker"

const domainId = "d91cd9bd-1176-453e-8fc1-35364d380206"
const sentId = "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794"
const configured: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "true",
  AMS_RESEND_API_KEY: "test-placeholder-not-a-real-resend-key",
  AMS_RESEND_DOMAIN_ID: domainId,
}

const mail = {
  recipient: "owner-test@example.net",
  fromAddress: AMS_CUSTOMER_FROM_ADDRESS,
  fromName: AMS_CUSTOMER_FROM_NAME,
  replyToAddress: AMS_CUSTOMER_FROM_ADDRESS,
  subject: "Your AMS Quick Marketing Audit — audit_123",
  plainText: "Report with 5 findings and a complete 7-day plan",
}

function fixture({
  status = "verified",
  domain = "aspectmarketingsolutions.app",
  capability = "enabled",
  providerStatus = 200,
  providerId = sentId,
  domainStatus = 200,
}: {
  status?: string
  domain?: string
  capability?: string
  providerStatus?: number
  providerId?: string
  domainStatus?: number
} = {}) {
  const calls: Array<{ url: string; method: string; headers: Headers; body?: string }> = []
  const fetcher: typeof fetch = async (url, init) => {
    const urlText = String(url)
    calls.push({
      url: urlText,
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: String(init?.body ?? ""),
    })
    if (urlText.endsWith("/domains/" + domainId)) {
      return Response.json({
        object: "domain",
        id: domainId,
        name: domain,
        status,
        capabilities: { sending: capability, receiving: "disabled" },
      }, { status: domainStatus })
    }
    if (urlText.endsWith("/emails")) {
      return Response.json({ id: providerId }, { status: providerStatus })
    }
    throw new Error("Unexpected outbound URL")
  }
  return { calls, fetcher }
}

test("the Resend adapter is fail-closed until explicitly configured on Preview", () => {
  for (const env of [
    { ...configured, VERCEL_ENV: "production" },
    { ...configured, AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "false" },
    { ...configured, AMS_RESEND_API_KEY: "" },
    { ...configured, AMS_RESEND_DOMAIN_ID: "" },
    { ...configured, AMS_RESEND_DOMAIN_ID: "../emails" },
  ]) {
    assert.throws(
      () => createResendAuditSender({ env }),
      /AMS_RESEND_SENDER_NOT_CONFIGURED/,
    )
  }
})

test("verifies the actual Resend domain and sends precisely branded transactional mail", async () => {
  const f = fixture()
  const sender = createResendAuditSender({ env: configured, fetcher: f.fetcher })
  const identity = await sender.inspectSender(AMS_CUSTOMER_FROM_ADDRESS)
  assert.deepEqual(identity, {
    address: AMS_CUSTOMER_FROM_ADDRESS,
    displayName: AMS_CUSTOMER_FROM_NAME,
    replyToAddress: AMS_CUSTOMER_FROM_ADDRESS,
    verificationStatus: "accepted",
  })
  const response = await sender.send(mail)
  assert.deepEqual(response, { messageId: sentId, fromAddress: AMS_CUSTOMER_FROM_ADDRESS })
  assert.equal(f.calls.length, 3)
  assert.equal(f.calls[0].method, "GET")
  assert.equal(f.calls[1].method, "GET")
  const outbound = f.calls[2]
  assert.equal(outbound.method, "POST")
  assert.equal(outbound.url, "https://api.resend.com/emails")
  assert.equal(outbound.headers.get("Authorization"), "Bearer test-placeholder-not-a-real-resend-key")
  assert.match(outbound.headers.get("Idempotency-Key") ?? "", /^ams-audit-[a-f0-9]{64}$/)
  const body = JSON.parse(outbound.body!)
  assert.deepEqual(body, {
    from: "Aspect Marketing Solutions <kimberley@aspectmarketingsolutions.app>",
    to: ["owner-test@example.net"],
    reply_to: "kimberley@aspectmarketingsolutions.app",
    subject: mail.subject,
    text: mail.plainText,
  })
  assert.doesNotMatch(JSON.stringify(body), /kimberleyaversbiz@gmail.com/)
})

test("a stable mail payload generates the same idempotency key across calls", async () => {
  const f = fixture()
  const sender = createResendAuditSender({ env: configured, fetcher: f.fetcher })
  await sender.send(mail)
  await sender.send(mail)
  const submitted = f.calls.filter(x => x.method === "POST")
  assert.equal(submitted.length, 2) // simulated fake provider; actual provider deduplicates
  assert.equal(submitted[0].headers.get("Idempotency-Key"), submitted[1].headers.get("Idempotency-Key"))
  assert.notEqual(submitted[0].headers.get("Idempotency-Key"), mail.recipient)
})

test("refuses unverified, wrong-domain, or sending-disabled provider identities", async () => {
  for (const variation of [
    { status: "pending" },
    { status: "partially_verified" },
    { status: "failed" },
    { domain: "example.com" },
    { capability: "disabled" },
    { domainStatus: 401 },
  ]) {
    const f = fixture(variation)
    const sender = createResendAuditSender({ env: configured, fetcher: f.fetcher })
    assert.equal(await sender.inspectSender(AMS_CUSTOMER_FROM_ADDRESS), null)
    await assert.rejects(sender.send(mail), /AMS_RESEND_DOMAIN_NOT_VERIFIED/)
    assert.equal(f.calls.some(x => x.method === "POST"), false)
  }
})

test("refuses personal Gmail, alternate names and reply-to addresses without even querying provider", async () => {
  for (const modification of [
    { fromAddress: "kimberleyaversbiz@gmail.com" },
    { fromName: "Personal Gmail" },
    { replyToAddress: "kimberleyaversbiz@gmail.com" },
    { recipient: "" },
  ]) {
    const f = fixture()
    const sender = createResendAuditSender({ env: configured, fetcher: f.fetcher })
    await assert.rejects(sender.send({ ...mail, ...modification }), /AMS_BUSINESS_SENDER_IDENTITY_REQUIRED/)
    assert.equal(f.calls.length, 0)
  }
})

test("provider failures and malformed acceptance IDs are not reported as successful sends", async () => {
  for (const f of [fixture({ providerStatus: 403 }), fixture({ providerId: "not-an-id" })]) {
    const sender = createResendAuditSender({ env: configured, fetcher: f.fetcher })
    await assert.rejects(sender.send(mail), /AMS_RESEND_(SEND|ACCEPTANCE)_UNCONFIRMED/)
    assert.equal(f.calls.filter(x => x.method === "POST").length, 1)
  }
})
