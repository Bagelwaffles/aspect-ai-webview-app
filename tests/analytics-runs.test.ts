import assert from "node:assert/strict"
import test from "node:test"

import { NextRequest } from "next/server"

import { GET, POST } from "../app/api/analytics/runs/route"
import { customerSubjectFromProviderSubject } from "../lib/auth"
import { ANALYTICS_RUN_RETENTION_SECONDS, AnalyticsRunStore, type AnalyticsClaimCommand, type AnalyticsClaimResult, type AnalyticsRunAdapter } from "../lib/server/analytics-runs"
import type { EntitlementSnapshot } from "../lib/server/entitlements"
import type { DistributedAiRateLimitResult } from "../lib/server/rate-limit"

type Globals = typeof globalThis & { __amsAnalyticsTestDependencies?: Record<string, unknown> }
const globals = globalThis as Globals
const subject = customerSubjectFromProviderSubject("analytics-owner")!
const otherSubject = customerSubjectFromProviderSubject("another-owner")!
const principal = { kind: "customer" as const, subject, billingEmail: "owner@example.com", email: "owner@example.com" }
const entitlement: EntitlementSnapshot = {
  configured: true, subject, billingEmail: principal.email, plan: "starter",
  subscriptionStatus: "active", planCredits: 0, topupCredits: 0, totalCredits: 0,
  agentSlugs: [], stripeCustomerId: "cus_test", stripeSubscriptionId: "sub_test",
}
const allowed: DistributedAiRateLimitResult = {
  allowed: true, available: true, code: "OK", distributed: true,
  limit: 10, remaining: 9, resetAt: Date.now() + 60_000, retryAfterSeconds: 60,
}

class MemoryAdapter implements AnalyticsRunAdapter {
  records = new Map<string, string>()
  histories = new Map<string, Array<{ member: string; score: number }>>()
  terminalTtl: number | null = null

  async claim(command: AnalyticsClaimCommand): Promise<AnalyticsClaimResult> {
    const raw = this.records.get(command.runKey)
    if (raw) {
      const existing = JSON.parse(raw)
      return existing.inputFingerprint === command.fingerprint
        ? { status: "existing", record: raw }
        : { status: "conflict", record: raw }
    }
    this.records.set(command.runKey, command.recordJson)
    const list = this.histories.get(command.historyKey) ?? []
    list.push({ member: command.member, score: command.score })
    this.histories.set(command.historyKey, list)
    return { status: "created", record: command.recordJson }
  }

  async setTerminal(input: { runKey: string; ownerSubject: string; recordJson: string; retentionSeconds: number }) {
    const current = this.records.get(input.runKey)
    if (!current || JSON.parse(current).ownerSubject !== input.ownerSubject) return false
    this.records.set(input.runKey, input.recordJson)
    this.terminalTtl = input.retentionSeconds
    return true
  }

  async list(input: { historyKey: string; runKeyPrefix: string; limit: number }) {
    return (this.histories.get(input.historyKey) ?? [])
      .sort((a, b) => b.score - a.score).slice(0, input.limit)
      .map(({ member }) => this.records.get(`${input.runKeyPrefix}${member}`) ?? null)
  }
}

function makeStore(adapter = new MemoryAdapter()) {
  let tick = 0
  return { adapter, store: new AnalyticsRunStore(adapter, () => new Date(Date.UTC(2026, 8, 11, 0, 0, tick++)), () => "analytics-run-test-0001") }
}

function deps(store: AnalyticsRunStore, events: string[] = []) {
  return {
    authorize: async () => principal,
    getEntitlements: async () => entitlement,
    hasAgentAccess: () => true,
    rateLimit: async () => allowed,
    analyze: async (bytes: Uint8Array) => {
      events.push(`analyze:${new TextDecoder().decode(bytes)}`)
      return { metadata: { rowCount: 1 }, columns: [{ name: "sales", evidenceIds: ["row-2"] }] }
    },
    getRunStore: () => store,
  }
}

function request(csv = "sales\n42", key = "analytics-run-1234") {
  const data = new FormData()
  data.set("file", new File([csv], "sales.csv", { type: "text/csv" }))
  return new NextRequest("http://localhost/api/analytics/runs", { method: "POST", headers: { "idempotency-key": key }, body: data })
}

test.afterEach(() => { delete globals.__amsAnalyticsTestDependencies })

test("requires a signed customer session and ignores bearer credentials", async () => {
  const { store } = makeStore()
  globals.__amsAnalyticsTestDependencies = { ...deps(store), authorize: async () => null }
  const req = request()
  req.headers.set("authorization", "Bearer internal-secret")
  const response = await POST(req)
  assert.equal(response.status, 401)
  assert.equal((await response.json()).code, "CUSTOMER_SESSION_REQUIRED")
  assert.equal(response.headers.get("cache-control"), "no-store")
})

test("fails closed when distributed rate limiting is unavailable", async () => {
  const events: string[] = []
  const { store } = makeStore()
  globals.__amsAnalyticsTestDependencies = {
    ...deps(store, events),
    rateLimit: async () => ({ ...allowed, allowed: false, available: false, code: "RATE_LIMIT_UNAVAILABLE" }),
  }
  const response = await POST(request())
  const body = await response.json()
  assert.equal(response.status, 503)
  assert.equal(body.code, "RATE_LIMIT_UNAVAILABLE")
  assert.equal(body.creditsCharged, 0)
  assert.deepEqual(events, [])
})

test("requires Analytics entitlement before reading CSV contents", async () => {
  const events: string[] = []
  const { store } = makeStore()
  globals.__amsAnalyticsTestDependencies = { ...deps(store, events), hasAgentAccess: () => false }
  const response = await POST(request("private,secret\nvalue,hidden"))
  assert.equal(response.status, 402)
  assert.equal((await response.json()).code, "SUBSCRIPTION_REQUIRED")
  assert.deepEqual(events, [])
})

test("rejects CSV payloads larger than 2 MiB", async () => {
  const { store } = makeStore()
  globals.__amsAnalyticsTestDependencies = deps(store)
  const response = await POST(request("x".repeat(2 * 1024 * 1024 + 1)))
  assert.equal(response.status, 413)
  assert.equal((await response.json()).creditsCharged, 0)
})

test("persists only derived result and safe metadata for seven days", async () => {
  const events: string[] = []
  const { adapter, store } = makeStore()
  globals.__amsAnalyticsTestDependencies = deps(store, events)
  const response = await POST(request("sales\n42"))
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.creditsCharged, 0)
  assert.equal(body.run.costCredits, 0)
  assert.equal(body.run.result.metadata.rowCount, 1)
  assert.equal(body.run.ownerSubject, undefined)
  assert.equal(body.run.inputFingerprint, undefined)
  assert.equal(adapter.terminalTtl, ANALYTICS_RUN_RETENTION_SECONDS)
  const persisted = [...adapter.records.values()].join("\n")
  assert.equal(persisted.includes("sales\\n42"), false)
  assert.deepEqual(events, ["analyze:sales\n42"])
})

test("strict idempotency replays results and conflicts on different CSV input", async () => {
  const events: string[] = []
  const { store } = makeStore()
  globals.__amsAnalyticsTestDependencies = deps(store, events)
  assert.equal((await POST(request())).status, 200)
  const replay = await POST(request())
  assert.equal(replay.status, 200)
  assert.equal((await replay.json()).idempotent, true)
  const conflict = await POST(request("sales\n99"))
  assert.equal(conflict.status, 409)
  assert.equal((await conflict.json()).code, "ANALYTICS_IDEMPOTENCY_CONFLICT")
  assert.equal(events.length, 1)
})

test("GET history is scoped to the authenticated stable subject", async () => {
  const { store } = makeStore()
  globals.__amsAnalyticsTestDependencies = deps(store)
  await POST(request())
  globals.__amsAnalyticsTestDependencies = { ...deps(store), authorize: async () => ({ ...principal, subject: otherSubject }) }
  const response = await GET(new NextRequest("http://localhost/api/analytics/runs"))
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.deepEqual(body.runs, [])
  assert.equal(response.headers.get("cache-control"), "no-store")
  assert.equal(body.creditsCharged, 0)
})
