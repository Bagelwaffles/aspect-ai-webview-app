import { test } from "node:test"
import assert from "node:assert/strict"

import { createResendAuditSender } from "../lib/server/quick-audit-resend-sender"
import {
  AMS_RESEND_DOMAIN,
  AMS_RESEND_DOMAIN_ID,
  hasCurrentResendDomainProof,
  inspectResendDomainForOwner,
  type ResendVerifiedDomainProof,
} from "../lib/server/quick-audit-resend-domain-proof"
import {
  AMS_CUSTOMER_FROM_ADDRESS,
  AMS_CUSTOMER_FROM_NAME,
} from "../lib/server/quick-audit-delivery-worker"

const sentId = "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794"
const timestamp = new Date("2026-10-23T19:00:00.000Z")
const proof: ResendVerifiedDomainProof = {
  domainId: AMS_RESEND_DOMAIN_ID,
  domainName: AMS_RESEND_DOMAIN,
  status: "verified",
  sending: "enabled",
  source: "resend-domain-api",
  verifiedAt: timestamp.toISOString(),
}
const configured: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "true",
  AMS_RESEND_SEND_API_KEY: "test-send-only-token-not-real",
  AMS_RESEND_DOMAIN_ID: AMS_RESEND_DOMAIN_ID,
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
  evidence = proof as ResendVerifiedDomainProof | null,
  providerStatus = 200,
  providerId = sentId,
  readThrows = false,
}: {
  evidence?: ResendVerifiedDomainProof | null
  providerStatus?: number
  providerId?: string
  readThrows?: boolean
} = {}) {
  const calls: Array<{ url: string; method: string; headers: Headers; body?: string }> = []
  let reads = 0
  const fetcher: typeof fetch = async (url, init) => {
    const text = String(url)
    calls.push({
      url: text,
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: String(init?.body ?? ""),
    })
    if (text === "https://api.resend.com/emails") {
      return Response.json({ id: providerId }, { status: providerStatus })
    }
    throw new Error("Only email send is allowed in worker")
  }
  const readDomainProof = async () => {
    reads++
    if (readThrows) throw new Error("store offline")
    return evidence
  }
  return { calls, fetcher, readDomainProof, get reads() { return reads } }
}
function sender(f: ReturnType<typeof fixture>) {
  return createResendAuditSender({
    env: configured,
    fetcher: f.fetcher,
    readDomainProof: f.readDomainProof,
    now: () => timestamp,
  })
}

test("sending-only Resend requires explicit Preview configuration and independent proof reader", () => {
  for (const env of [
    { ...configured, VERCEL_ENV: "production" },
    { ...configured, AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "false" },
    { ...configured, AMS_RESEND_SEND_API_KEY: "" },
    { ...configured, AMS_RESEND_DOMAIN_ID: "" },
    { ...configured, AMS_RESEND_DOMAIN_ID: "d91cd9bd-1176-453e-8fc1-35364d380206" },
  ]) {
    assert.throws(() => createResendAuditSender({
      env, readDomainProof: async () => proof,
    }), /AMS_RESEND_SENDER_NOT_CONFIGURED/)
  }
  assert.throws(() => createResendAuditSender({
    env: configured, readDomainProof: null as never,
  }), /AMS_RESEND_SENDER_NOT_CONFIGURED/)
})

test("branded request goes only to email endpoint with domain-restricted token", async () => {
  const f = fixture(), s = sender(f)
  assert.deepEqual(await s.inspectSender(AMS_CUSTOMER_FROM_ADDRESS), {
    address: AMS_CUSTOMER_FROM_ADDRESS,
    displayName: AMS_CUSTOMER_FROM_NAME,
    replyToAddress: AMS_CUSTOMER_FROM_ADDRESS,
    verificationStatus: "accepted",
  })
  const response = await s.send(mail)
  assert.deepEqual(response, { messageId: sentId, fromAddress: AMS_CUSTOMER_FROM_ADDRESS })
  assert.equal(f.calls.length, 1)
  const outbound = f.calls[0]
  assert.equal(outbound.method, "POST")
  assert.equal(outbound.url, "https://api.resend.com/emails")
  assert.equal(outbound.headers.get("Authorization"), "Bearer test-send-only-token-not-real")
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
  assert.equal(f.reads, 2)
})

test("same payload produces same 24-hour provider idempotency key", async () => {
  const f = fixture(), s = sender(f)
  await s.send(mail)
  await s.send(mail)
  assert.equal(f.calls.length, 2) // simulated provider; upstream outbox enforces no duplicate
  assert.equal(f.calls[0].headers.get("Idempotency-Key"), f.calls[1].headers.get("Idempotency-Key"))
})

test("provider verification proof expires and any invalid claim holds before sending", async () => {
  const invalid: Array<ResendVerifiedDomainProof | null> = [
    null,
    { ...proof, status: "pending" } as unknown as ResendVerifiedDomainProof,
    { ...proof, domainName: "unrelated.com" },
    { ...proof, domainId: "11111111-2222-3333-4444-555555555555" },
    { ...proof, sending: "disabled" } as unknown as ResendVerifiedDomainProof,
    { ...proof, source: "owner-env" } as unknown as ResendVerifiedDomainProof,
    { ...proof, verifiedAt: "2026-10-23T18:44:59.000Z" },
    { ...proof, verifiedAt: "2026-10-23T19:01:00.000Z" },
  ]
  for (const evidence of invalid) {
    const f = fixture({ evidence }), s = sender(f)
    assert.equal(await s.inspectSender(AMS_CUSTOMER_FROM_ADDRESS), null)
    await assert.rejects(s.send(mail), /AMS_RESEND_DOMAIN_NOT_VERIFIED/)
    assert.equal(f.calls.length, 0)
  }
  const f = fixture({ readThrows: true }), s = sender(f)
  assert.equal(await s.inspectSender(AMS_CUSTOMER_FROM_ADDRESS), null)
  await assert.rejects(s.send(mail), /AMS_RESEND_DOMAIN_NOT_VERIFIED/)
})

test("rejects personal Gmail identity, wrong display name, Reply-To and empty recipient", async () => {
  for (const change of [
    { fromAddress: "kimberleyaversbiz@gmail.com" },
    { fromName: "Personal Gmail" },
    { replyToAddress: "kimberleyaversbiz@gmail.com" },
    { recipient: "" },
  ]) {
    const f = fixture(), s = sender(f)
    await assert.rejects(s.send({ ...mail, ...change }), /AMS_BUSINESS_SENDER_IDENTITY_REQUIRED/)
    assert.equal(f.calls.length, 0)
    assert.equal(f.reads, 0)
  }
})

test("ambiguous provider response and malformed accepted ID are not success", async () => {
  for (const f of [fixture({ providerStatus: 403 }), fixture({ providerId: "not-a-uuid" })]) {
    await assert.rejects(sender(f).send(mail), /AMS_RESEND_(SEND|ACCEPTANCE)_UNCONFIRMED/)
    assert.equal(f.calls.length, 1)
  }
})

test("independent administrative status probe generates a short-lived proof", async () => {
  const adminCalls: Array<{ url: string; token: string }> = []
  const fetcher: typeof fetch = async (url, init) => {
    adminCalls.push({
      url: String(url),
      token: new Headers(init?.headers).get("Authorization") ?? "",
    })
    return Response.json({
      id: AMS_RESEND_DOMAIN_ID,
      name: AMS_RESEND_DOMAIN,
      status: "verified",
      capabilities: { sending: "enabled", receiving: "disabled" },
    })
  }
  const got = await inspectResendDomainForOwner({
    fullAccessKey: "temporary-admin-only-test-token",
    now: timestamp,
    fetcher,
  })
  assert.deepEqual(got, proof)
  assert.ok(hasCurrentResendDomainProof(got, timestamp))
  assert.equal(adminCalls.length, 1)
  assert.equal(adminCalls[0].url, "https://api.resend.com/domains/" + AMS_RESEND_DOMAIN_ID)
  assert.equal(adminCalls[0].token, "Bearer temporary-admin-only-test-token")
})

test("administrative probe cannot attest an unverified or unrelated sending domain", async () => {
  for (const response of [
    { id: AMS_RESEND_DOMAIN_ID, name: AMS_RESEND_DOMAIN, status: "pending", capabilities: { sending: "enabled" } },
    { id: AMS_RESEND_DOMAIN_ID, name: "other.com", status: "verified", capabilities: { sending: "enabled" } },
    { id: AMS_RESEND_DOMAIN_ID, name: AMS_RESEND_DOMAIN, status: "verified", capabilities: { sending: "disabled" } },
  ]) {
    const verified = await inspectResendDomainForOwner({
      fullAccessKey: "dummy-admin-only",
      now: timestamp,
      fetcher: async () => Response.json(response),
    })
    assert.equal(verified, null)
  }
  const denied = await inspectResendDomainForOwner({
    fullAccessKey: "admin-invalid",
    fetcher: async () => new Response("Forbidden", { status: 403 }),
  })
  assert.equal(denied, null)
})
