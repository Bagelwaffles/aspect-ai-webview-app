import { test } from "node:test"
import { RESEND_PREVIEW_BRANCH } from "../lib/server/quick-audit-resend-preview-preflight"
import assert from "node:assert/strict"

import { QuickAuditDeliveryOutbox, type OutboxRedis } from "../lib/server/quick-audit-delivery-outbox"
import {
  deliverQuickAuditOwnerPreview,
  renderQuickAuditPlainText,
  AMS_CUSTOMER_FROM_ADDRESS,
  AMS_CUSTOMER_FROM_NAME,
  type PaidQuickAuditProof,
  type QuickAuditTransactionalSender,
} from "../lib/server/quick-audit-delivery-worker"
import type { NativeQuickAuditResult, QuickAuditResultStore } from "../lib/server/quick-audit-native"

const owner = "kimberleyaversbiz@gmail.com"
const data = {
  auditId: "audit_123456789abcdef",
  requestId: "quick-audit-123456789",
  checkoutSessionId: "cs_test_123456789abcdef",
  recipient: owner,
  paidAndPersisted: true,
}
const flagEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: RESEND_PREVIEW_BRANCH,
  AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL: owner,
  AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "true",
}

function fakeRedis() {
  const records = new Map<string, string>()
  const redis: OutboxRedis = {
    async get(key) { return (records.get(key) ?? null) as never },
    async set(key, value, options) {
      if (options.nx && records.has(key)) return null
      records.set(key, value)
      return "OK"
    },
    async eval(_script, keys, args) {
      if (records.get(keys[0]) !== args[0]) return 0
      records.set(keys[0], args[1])
      return 1
    },
  }
  return redis
}

function report(): NativeQuickAuditResult {
  return {
    version: "native-v1",
    auditId: data.auditId,
    requestId: data.requestId,
    businessName: "Example Flowers",
    websiteUrl: "https://example.com",
    industry: "Florist",
    goal: "Get more bookings",
    generatedAt: "2026-10-23T18:00:00.000Z",
    strengths: ["A clear primary headline was detected."],
    findings: Array.from({ length: 5 }, (_, i) => ({
      title: `Issue ${i + 1}`, observation: "An automated signal.",
      fix: "Review and improve the affected page.",
    })),
    improvedHeadline: "Flowers for your special event",
    improvedOffer: "A clear bouquet offer",
    promotionalPost: "Discover fresh flowers",
    sevenDayPlan: Array.from({ length: 7 }, (_, i) => ({
      day: i + 1, action: `Action ${i + 1}`,
    })),
    evidence: { hasPrimaryCta: false },
  }
}

function fixture(options: {
  evidence?: boolean
  reportMatches?: boolean
  providerFails?: boolean
  identityStatus?: "accepted" | "pending" | "missing"
  identityFrom?: string
  identityName?: string
  identityReplyTo?: string
  identityThrows?: boolean
  providerFrom?: string
} = {}) {
  const box = new QuickAuditDeliveryOutbox(fakeRedis())
  const sent: Array<{
    recipient: string
    fromAddress: string
    fromName: string
    replyToAddress: string
    subject: string
    plainText: string
  }> = []
  const proof: PaidQuickAuditProof = {
    async readSession(checkoutSessionId) {
      return options.evidence === false ? null : {
        status: "completed", checkoutSessionId,
        requestId: data.requestId, n8nAuditId: data.auditId,
      }
    },
  }
  const reports: QuickAuditResultStore = {
    async getByRequestId() {
      return options.reportMatches === false ? { ...report(), auditId: "audit_mismatch000" } : report()
    },
    async save() { throw new Error("Worker must not create or change audit reports") },
  }
  const sender: QuickAuditTransactionalSender = {
    async inspectSender(address) {
      if (options.identityThrows) throw new Error("Provider sender-identity lookup failed")
      return {
        address: options.identityFrom ?? address,
        displayName: options.identityName ?? AMS_CUSTOMER_FROM_NAME,
        replyToAddress: options.identityReplyTo ?? AMS_CUSTOMER_FROM_ADDRESS,
        verificationStatus: options.identityStatus ?? "accepted",
      }
    },
    async send(message) {
      sent.push(message)
      if (options.providerFails) throw new Error("Unknown response from Gmail")
      return {
        messageId: "gmail-test-provider-id",
        fromAddress: options.providerFrom ?? message.fromAddress,
      }
    },
  }
  return { box, proof, reports, sender, sent }
}

test("never sends in production or without the independent Preview flag", async () => {
  const f = fixture()
  await f.box.enqueue(data)
  for (const env of [
    { ...flagEnv, VERCEL_ENV: "production" },
    { ...flagEnv, AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED: "false" },
    { ...flagEnv, AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL: "" },
  ]) {
    assert.deepEqual(await deliverQuickAuditOwnerPreview({
      requestId: data.requestId, sender: f.sender, env,
      outbox: f.box, proof: f.proof, reports: f.reports,
    }), { status: "disabled" })
  }
  assert.equal(f.sent.length, 0)
})

test("holds unpaid, mismatched, or non-owner destinations without claiming", async () => {
  for (const variant of ["missing-proof", "mismatch-report", "other-recipient", "live-session"]) {
    const f = fixture({
      evidence: variant !== "missing-proof",
      reportMatches: variant !== "mismatch-report",
    })
    await f.box.enqueue({
      ...data,
      recipient: variant === "other-recipient" ? "buyer@example.com" : owner,
      checkoutSessionId: variant === "live-session" ? "cs_live_123456789" : data.checkoutSessionId,
    })
    const outcome = await deliverQuickAuditOwnerPreview({
      requestId: data.requestId, sender: f.sender, env: flagEnv,
      outbox: f.box, proof: f.proof, reports: f.reports,
    })
    assert.deepEqual(outcome, { status: "held" }, variant)
    assert.equal(f.sent.length, 0)
    assert.equal((await f.box.read(data.requestId))?.state, "queued")
  }
})

test("sends full audit at most once after durable paid and report proof", async () => {
  const f = fixture()
  await f.box.enqueue(data)
  const input = {requestId: data.requestId, sender: f.sender, env: flagEnv,
    outbox: f.box, proof: f.proof, reports: f.reports}
  assert.deepEqual(await deliverQuickAuditOwnerPreview(input), { status: "submitted" })
  assert.equal(f.sent.length, 1)
  assert.equal(f.sent[0].recipient, owner)
  assert.equal(f.sent[0].fromAddress, AMS_CUSTOMER_FROM_ADDRESS)
  assert.equal(f.sent[0].fromName, "Aspect Marketing Solutions")
  assert.equal(f.sent[0].replyToAddress, AMS_CUSTOMER_FROM_ADDRESS)
  assert.match(f.sent[0].plainText, /FIVE PRIORITY FINDINGS/)
  assert.match(f.sent[0].plainText, /Day 7: Action 7/)
  assert.match(f.sent[0].plainText, /Flowers for your special event/)
  assert.equal((await f.box.read(data.requestId))?.state, "submitted")
  assert.equal((await f.box.read(data.requestId))?.providerMessageId, "gmail-test-provider-id")
  assert.deepEqual(await deliverQuickAuditOwnerPreview(input), { status: "duplicate" })
  assert.equal(f.sent.length, 1)
})

test("ambiguous Gmail provider response stays held and is never retried", async () => {
  const f = fixture({ providerFails: true })
  await f.box.enqueue(data)
  const input = {requestId: data.requestId, sender: f.sender, env: flagEnv,
    outbox: f.box, proof: f.proof, reports: f.reports}
  assert.deepEqual(await deliverQuickAuditOwnerPreview(input), { status: "uncertain" })
  assert.equal((await f.box.read(data.requestId))?.state, "uncertain")
  assert.deepEqual(await deliverQuickAuditOwnerPreview(input), { status: "duplicate" })
  assert.equal(f.sent.length, 1)
})

test("plain-text report includes findings and seven-day plan without HTML wrapper", () => {
  const text = renderQuickAuditPlainText(report())
  assert.match(text, /Example Flowers/)
  assert.match(text, /Business goal: Get more bookings/)
  assert.match(text, /Issue 5/)
  assert.match(text, /Day 7/)
  assert.doesNotMatch(text, /<html|<script/i)
})

test("blocks missing or unverified business From without consuming an audit claim", async () => {
  for (const variant of [
    { identityStatus: "pending" as const },
    { identityStatus: "missing" as const },
    { identityFrom: "kimberleyaversbiz@gmail.com" },
    { identityName: "Personal Gmail" },
    { identityReplyTo: "kimberleyaversbiz@gmail.com" },
    { identityThrows: true },
  ]) {
    const f = fixture(variant)
    await f.box.enqueue(data)
    const result = await deliverQuickAuditOwnerPreview({
      requestId: data.requestId, sender: f.sender, env: flagEnv,
      outbox: f.box, proof: f.proof, reports: f.reports,
    })
    assert.deepEqual(result, { status: "held" }, JSON.stringify(variant))
    assert.equal(f.sent.length, 0)
    assert.equal((await f.box.read(data.requestId))?.state, "queued")
  }
})

test("rejects provider acceptance under a personal Gmail From and prevents a duplicate", async () => {
  const f = fixture({ providerFrom: "kimberleyaversbiz@gmail.com" })
  await f.box.enqueue(data)
  const input = {
    requestId: data.requestId, sender: f.sender, env: flagEnv,
    outbox: f.box, proof: f.proof, reports: f.reports,
  }
  assert.deepEqual(await deliverQuickAuditOwnerPreview(input), { status: "uncertain" })
  assert.equal(f.sent.length, 1)
  assert.equal((await f.box.read(data.requestId))?.state, "uncertain")
  assert.deepEqual(await deliverQuickAuditOwnerPreview(input), { status: "duplicate" })
  assert.equal(f.sent.length, 1)
})

test("owner dispatcher refuses other Preview branches before touching any store or sender", async () => {
  const f = fixture()
  await f.box.enqueue(data)
  for (const env of [
    { ...flagEnv, VERCEL_GIT_COMMIT_REF: "main" },
    { ...flagEnv, VERCEL_GIT_COMMIT_REF: "feat/unrelated" },
    { ...flagEnv, VERCEL_GIT_COMMIT_REF: undefined },
  ]) {
    assert.deepEqual(await deliverQuickAuditOwnerPreview({
      requestId: data.requestId, sender: f.sender, env,
      outbox: f.box, proof: f.proof, reports: f.reports,
    }), { status: "disabled" })
  }
  assert.equal(f.sent.length, 0)
  assert.equal((await f.box.read(data.requestId))?.state, "queued")
})

test("owner dispatcher refuses missing isolated-store injections instead of falling back to default Redis", async () => {
  const f = fixture()
  await f.box.enqueue(data)
  const essential = {
    requestId: data.requestId,
    sender: f.sender,
    env: flagEnv,
  }
  for (const dependencies of [
    {},
    { outbox: f.box },
    { proof: f.proof },
    { reports: f.reports },
    { outbox: f.box, proof: f.proof },
    { outbox: f.box, reports: f.reports },
    { proof: f.proof, reports: f.reports },
  ]) {
    assert.deepEqual(
      await deliverQuickAuditOwnerPreview({ ...essential, ...dependencies }),
      { status: "disabled" },
    )
  }
  assert.equal(f.sent.length, 0)
  assert.equal((await f.box.read(data.requestId))?.state, "queued")
})
