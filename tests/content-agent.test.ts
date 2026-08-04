import assert from "node:assert/strict"
import test from "node:test"

import { NextRequest } from "next/server"

import { GET as contentRunsGet, POST as contentRunsPost } from "../app/api/content-agent/runs/route"
import { customerSubjectFromProviderSubject } from "../lib/auth"
import type { ContentAgentInput, ContentAgentOutput } from "../lib/server/content-agent"
import {
  CONTENT_AGENT_RUN_LEASE_SECONDS,
  ContentAgentRunStore,
  hasUnresolvedContentAgentFinancialState,
  type ContentAgentRunAdapter,
  type ContentAgentRunClaimCommand,
  type ContentAgentRunClaimResult,
  type ContentAgentRunGetCommand,
  type ContentAgentRunListCommand,
  type ContentAgentRunRecord,
  type ContentAgentRunTransitionCommand,
  type ContentAgentRunTransitionResult,
} from "../lib/server/content-agent-runs"
import type { CreditFinalizationResult, CreditReservationResult } from "../lib/server/credit-ledger"
import type { EntitlementSnapshot } from "../lib/server/entitlements"
import type { DistributedAiRateLimitResult } from "../lib/server/rate-limit"

type RouteTestGlobals = typeof globalThis & {
  __amsContentAgentTestDependencies?: Record<string, unknown>
}

const routeTestGlobals = globalThis as RouteTestGlobals

function customerSubject(value: string): string {
  const result = customerSubjectFromProviderSubject(value)
  assert.ok(result)
  return result
}

const customer = {
  kind: "customer" as const,
  subject: customerSubject("content-owner-provider-subject"),
  billingEmail: "content-owner@example.com",
  email: "content-owner@example.com",
}

const activeSnapshot: EntitlementSnapshot = {
  configured: true,
  subject: customer.subject,
  billingEmail: customer.billingEmail,
  plan: "starter",
  subscriptionStatus: "active",
  planCredits: 10,
  topupCredits: 0,
  totalCredits: 10,
  agentSlugs: [],
  stripeCustomerId: "cus_content_test",
  stripeSubscriptionId: "sub_content_test",
}

const validInput: ContentAgentInput = {
  businessName: "Aspect Test Business",
  audience: "Small business owners",
  goal: "Announce a practical marketing planning workshop",
  channel: "social",
  tone: "professional",
  offer: "A workshop with clear planning steps and no guaranteed outcomes",
}

const validOutput: ContentAgentOutput = {
  headline: "Plan your next marketing campaign",
  body: "Build a focused campaign brief with clear goals, audience, and next steps.",
  callToAction: "Review the workshop details",
  safetyNotes: ["Confirm workshop availability before publishing."],
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

class MemoryContentAgentRunAdapter implements ContentAgentRunAdapter {
  private readonly records = new Map<string, ContentAgentRunRecord>()
  private readonly lists = new Map<string, Array<{ member: string; score: number }>>()
  private readonly retention = new Map<string, number | null>()
  transitionCalls = 0
  failTransitionNumber: number | null = null
  onExistingClaim: (() => void) | null = null
  includeMissingListRecord = false

  private pruneResolved(listKey: string, runKeyPrefix: string, maxHistory: number) {
    const list = this.lists.get(listKey) ?? []
    let resolvedKept = 0
    const retained = list
      .slice()
      .sort((left, right) => right.score - left.score)
      .filter(({ member }) => {
        const runKey = `${runKeyPrefix}${member}`
        const record = this.records.get(runKey)
        if (!record) return false
        if (hasUnresolvedContentAgentFinancialState(record.status)) return true
        resolvedKept += 1
        if (resolvedKept <= maxHistory) return true
        this.records.delete(runKey)
        this.retention.delete(record.idempotencyKey)
        return false
      })
      .sort((left, right) => left.score - right.score)
    this.lists.set(listKey, retained)
  }

  retentionFor(idempotencyKey: string): number | null | undefined {
    return this.retention.get(idempotencyKey)
  }

  async claim(command: ContentAgentRunClaimCommand): Promise<ContentAgentRunClaimResult> {
    const existing = this.records.get(command.runKey)
    if (existing) {
      if (
        existing.inputFingerprint !== command.record.inputFingerprint ||
        existing.idempotencyKey !== command.record.idempotencyKey
      ) {
        return { status: "conflict", record: clone(existing) }
      }
      if (hasUnresolvedContentAgentFinancialState(existing.status)) {
        const list = this.lists.get(command.listKey) ?? []
        const member = list.find((entry) => entry.member === command.listMember)
        if (member) {
          member.score = command.score
        } else {
          list.push({ member: command.listMember, score: command.score })
        }
        list.sort((left, right) => left.score - right.score)
        this.lists.set(command.listKey, list)
        this.retention.set(existing.idempotencyKey, null)
      }
      this.onExistingClaim?.()
      return { status: "existing", record: clone(existing) }
    }

    this.records.set(command.runKey, clone(command.record))
    this.retention.set(command.record.idempotencyKey, null)
    const list = this.lists.get(command.listKey) ?? []
    list.push({ member: command.listMember, score: command.score })
    list.sort((left, right) => left.score - right.score)
    this.lists.set(command.listKey, list)
    this.pruneResolved(command.listKey, command.runKeyPrefix, command.maxHistory)
    return { status: "created", record: clone(command.record) }
  }

  async get(command: ContentAgentRunGetCommand): Promise<unknown | null> {
    const record = this.records.get(command.runKey)
    return record ? clone(record) : null
  }

  async compareAndSet(
    command: ContentAgentRunTransitionCommand,
  ): Promise<ContentAgentRunTransitionResult> {
    this.transitionCalls += 1
    if (this.failTransitionNumber === this.transitionCalls) {
      throw new Error("simulated persistence failure")
    }

    const current = this.records.get(command.runKey)
    if (!current) return { status: "not_found" }
    if (current.ownerSubject !== command.ownerSubject) return { status: "owner_conflict" }
    if (
      current.revision !== command.expectedRevision ||
      !command.expectedStatuses.includes(current.status)
    ) {
      return { status: "transition_conflict", record: clone(current) }
    }

    this.records.set(command.runKey, clone(command.record))
    this.retention.set(
      command.record.idempotencyKey,
      hasUnresolvedContentAgentFinancialState(command.record.status)
        ? null
        : command.retentionSeconds,
    )
    this.pruneResolved(command.listKey, command.runKeyPrefix, command.maxHistory)
    return { status: "updated", record: clone(command.record) }
  }

  async list(command: ContentAgentRunListCommand): Promise<unknown[]> {
    const records: unknown[] = (this.lists.get(command.listKey) ?? [])
      .slice()
      .sort((left, right) => right.score - left.score)
      .slice(0, command.limit)
      .map(({ member }) => this.records.get(`${command.runKeyPrefix}${member}`))
      .filter((record): record is ContentAgentRunRecord => Boolean(record))
      .map(clone)

    if (this.includeMissingListRecord) records.push(null)
    return records
  }
}

function createStore(
  adapter = new MemoryContentAgentRunAdapter(),
  clock?: () => Date,
) {
  let id = 0
  let tick = 0
  return {
    adapter,
    store: new ContentAgentRunStore(
      adapter,
      clock ?? (() => new Date(Date.UTC(2026, 7, 3, 12, 0, tick++))),
      () => `test-run-${String(++id).padStart(4, "0")}`,
    ),
  }
}

function reservation(
  state: CreditReservationResult["state"] = "reserved",
  idempotent = false,
): CreditReservationResult {
  return {
    reservationId: "content-reservation-1",
    amount: 1,
    planUnits: state === "rejected" ? 0 : 1,
    topupUnits: 0,
    state,
    reserved: state !== "rejected",
    idempotent,
    planCredits: state === "rejected" ? 0 : 9,
    topupCredits: 0,
    totalCredits: state === "rejected" ? 0 : 9,
  }
}

function terminal(state: CreditFinalizationResult["state"]): CreditFinalizationResult {
  return {
    reservationId: "content-reservation-1",
    amount: 1,
    planUnits: 1,
    topupUnits: 0,
    state,
    idempotent: false,
    planCredits: state === "refunded" ? 10 : 9,
    topupCredits: 0,
    totalCredits: state === "refunded" ? 10 : 9,
  }
}

function allowedRateLimit(
  overrides: Partial<DistributedAiRateLimitResult> = {},
): DistributedAiRateLimitResult {
  return {
    allowed: true,
    available: true,
    code: "OK",
    limit: 10,
    remaining: 9,
    resetAt: Date.now() + 60_000,
    retryAfterSeconds: 60,
    distributed: true,
    ...overrides,
  }
}

function baseDependencies(store: ContentAgentRunStore, events: string[] = []) {
  return {
    authorize: async () => customer,
    getEntitlements: async () => activeSnapshot,
    hasAgentAccess: () => true,
    rateLimit: async () => allowedRateLimit(),
    reserve: async () => {
      events.push("reserve")
      return reservation()
    },
    commit: async () => {
      events.push("commit")
      return terminal("committed")
    },
    refund: async () => {
      events.push("refund")
      return terminal("refunded")
    },
    providerConfigured: () => true,
    runProvider: async () => {
      events.push("provider")
      return validOutput
    },
    getRunStore: () => store,
  }
}

function installDependencies(dependencies: Record<string, unknown>) {
  routeTestGlobals.__amsContentAgentTestDependencies = dependencies
}

function postRequest(body: unknown = validInput, idempotencyKey = "content-operation-1234") {
  return new NextRequest("http://127.0.0.1:3000/api/content-agent/runs", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(body),
  })
}

function getRequest() {
  return new NextRequest("http://127.0.0.1:3000/api/content-agent/runs")
}

test("Content Agent requires a customer session before any run work", async () => {
  const events: string[] = []
  const { store } = createStore()
  installDependencies({
    ...baseDependencies(store, events),
    authorize: async () => ({ kind: "internal" as const, subject: "internal-api" }),
  })

  const response = await contentRunsPost(postRequest())
  const body = await response.json()

  assert.equal(response.status, 401)
  assert.equal(body.code, "CUSTOMER_SESSION_REQUIRED")
  assert.deepEqual(events, [])
})

test("Content Agent rejects unsupported client-controlled fields and invalid briefs", async () => {
  const events: string[] = []
  const { store } = createStore()
  installDependencies(baseDependencies(store, events))

  const response = await contentRunsPost(
    postRequest({
      ...validInput,
      organizationId: "client-org",
      userId: "client-user",
      model: "client-model",
      price: 0,
      credits: 999,
      successUrl: "http://localhost:3000/fake",
    }),
  )
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.equal(body.code, "INVALID_CONTENT_INPUT")
  assert.deepEqual(events, [])
})

test("Content Agent enforces entitlement before claiming or reserving a run", async () => {
  const events: string[] = []
  const { store } = createStore()
  installDependencies({
    ...baseDependencies(store, events),
    hasAgentAccess: () => false,
  })

  const response = await contentRunsPost(postRequest())
  const body = await response.json()

  assert.equal(response.status, 402)
  assert.equal(body.code, "SUBSCRIPTION_REQUIRED")
  assert.deepEqual(events, [])
  assert.deepEqual(await store.listForOwner(customer.subject), [])
})

test("Content Agent distributed rate limiting fails closed", async () => {
  const events: string[] = []
  const { store } = createStore()
  installDependencies({
    ...baseDependencies(store, events),
    rateLimit: async () =>
      allowedRateLimit({
        allowed: false,
        available: false,
        code: "RATE_LIMIT_UNAVAILABLE",
        remaining: 0,
      }),
  })

  const response = await contentRunsPost(postRequest())
  const body = await response.json()

  assert.equal(response.status, 503)
  assert.equal(body.code, "RATE_LIMIT_UNAVAILABLE")
  assert.deepEqual(events, [])
})

test("concurrent Content Agent retries execute the provider and reserve only once", async () => {
  const events: string[] = []
  const { adapter, store } = createStore()
  let releaseProvider!: () => void
  let providerStarted!: () => void
  let duplicateClaimed!: () => void
  const started = new Promise<void>((resolve) => {
    providerStarted = resolve
  })
  const release = new Promise<void>((resolve) => {
    releaseProvider = resolve
  })
  const duplicateObserved = new Promise<void>((resolve) => {
    duplicateClaimed = resolve
  })
  adapter.onExistingClaim = duplicateClaimed

  installDependencies({
    ...baseDependencies(store, events),
    runProvider: async () => {
      events.push("provider")
      providerStarted()
      await release
      return validOutput
    },
  })

  const first = contentRunsPost(postRequest())
  await started
  const second = contentRunsPost(postRequest())
  await duplicateObserved
  releaseProvider()
  const responses = await Promise.all([first, second])
  const bodies = await Promise.all(responses.map((response) => response.json()))

  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 202])
  assert.equal(events.filter((event) => event === "reserve").length, 1)
  assert.equal(events.filter((event) => event === "provider").length, 1)
  assert.equal(events.filter((event) => event === "commit").length, 1)
  assert.ok(bodies.some((body) => body.code === "CONTENT_RUN_IN_PROGRESS"))
})

test("a stale queued run refunds its unambiguous pre-provider reservation", async () => {
  const events: string[] = []
  let now = Date.UTC(2026, 7, 3, 12, 0, 0)
  const { adapter, store } = createStore(
    new MemoryContentAgentRunAdapter(),
    () => new Date(now),
  )
  await store.claim({
    ownerSubject: customer.subject,
    idempotencyKey: "content-operation-1234",
    content: validInput,
  })
  now += (CONTENT_AGENT_RUN_LEASE_SECONDS + 1) * 1_000
  installDependencies(baseDependencies(store, events))

  const response = await contentRunsPost(postRequest())
  const body = await response.json()
  const runs = await store.listForOwner(customer.subject)

  assert.equal(response.status, 409)
  assert.equal(body.code, "STALE_QUEUED_RUN_REFUNDED")
  assert.deepEqual(events, ["reserve", "refund"])
  assert.equal(runs[0]?.status, "refunded")
  assert.equal(runs[0]?.creditState, "refunded")
  assert.ok((adapter.retentionFor("content-operation-1234") ?? 0) > 0)
})

test("a stale queued run with a committed ledger state is quarantined without refund", async () => {
  const events: string[] = []
  let now = Date.UTC(2026, 7, 3, 12, 0, 0)
  const { adapter, store } = createStore(
    new MemoryContentAgentRunAdapter(),
    () => new Date(now),
  )
  await store.claim({
    ownerSubject: customer.subject,
    idempotencyKey: "content-operation-1234",
    content: validInput,
  })
  now += (CONTENT_AGENT_RUN_LEASE_SECONDS + 1) * 1_000
  installDependencies({
    ...baseDependencies(store, events),
    reserve: async () => {
      events.push("reserve")
      return reservation("committed", true)
    },
  })

  const response = await contentRunsPost(postRequest())
  const body = await response.json()
  const runs = await store.listForOwner(customer.subject)

  assert.equal(response.status, 503)
  assert.equal(body.code, "CONTENT_RUN_RECONCILIATION_REQUIRED")
  assert.deepEqual(events, ["reserve"])
  assert.equal(runs[0]?.status, "reconciliation")
  assert.equal(runs[0]?.creditState, "reconciliation")
  assert.equal(adapter.retentionFor("content-operation-1234"), null)
})

test("a stale running provider lease moves to reconciliation without automatic refund", async () => {
  const events: string[] = []
  let now = Date.UTC(2026, 7, 3, 12, 0, 0)
  const { adapter, store } = createStore(
    new MemoryContentAgentRunAdapter(),
    () => new Date(now),
  )
  await store.claim({
    ownerSubject: customer.subject,
    idempotencyKey: "content-operation-1234",
    content: validInput,
  })
  await store.transition({
    ownerSubject: customer.subject,
    idempotencyKey: "content-operation-1234",
    expectedStatuses: ["queued"],
    status: "running",
    creditState: "reserved",
    pendingOutput: null,
    output: null,
    errorCode: null,
  })
  now += (CONTENT_AGENT_RUN_LEASE_SECONDS + 1) * 1_000
  installDependencies(baseDependencies(store, events))

  const response = await contentRunsPost(postRequest())
  const body = await response.json()
  const runs = await store.listForOwner(customer.subject)

  assert.equal(response.status, 503)
  assert.equal(body.code, "CONTENT_RUN_RECONCILIATION_REQUIRED")
  assert.deepEqual(events, [])
  assert.equal(runs[0]?.status, "reconciliation")
  assert.equal(runs[0]?.creditState, "reconciliation")
  assert.equal(adapter.retentionFor("content-operation-1234"), null)
})

test("provider failures refund the reserved credit and persist a refunded run", async () => {
  const events: string[] = []
  const { store } = createStore()
  installDependencies({
    ...baseDependencies(store, events),
    runProvider: async () => {
      events.push("provider")
      throw new Error("provider detail must not escape")
    },
  })

  const response = await contentRunsPost(postRequest())
  const body = await response.json()
  const runs = await store.listForOwner(customer.subject)

  assert.equal(response.status, 502)
  assert.equal(body.code, "CONTENT_PROVIDER_FAILED")
  assert.equal(JSON.stringify(body).includes("provider detail"), false)
  assert.deepEqual(events, ["reserve", "provider", "refund"])
  assert.equal(runs[0]?.status, "refunded")
  assert.equal(runs[0]?.creditState, "refunded")
  assert.equal(runs[0]?.output, null)
})

test("invalid structured provider output refunds the reserved credit", async () => {
  const events: string[] = []
  const { store } = createStore()
  installDependencies({
    ...baseDependencies(store, events),
    runProvider: async () => {
      events.push("provider")
      return { ...validOutput, body: "", extra: "unsupported" }
    },
  })

  const response = await contentRunsPost(postRequest())
  const body = await response.json()
  const runs = await store.listForOwner(customer.subject)

  assert.equal(response.status, 502)
  assert.equal(body.code, "CONTENT_PROVIDER_INVALID_RESPONSE")
  assert.deepEqual(events, ["reserve", "provider", "refund"])
  assert.equal(runs[0]?.status, "refunded")
  assert.equal(runs[0]?.output, null)
})

test("pre-commit persistence failure refunds and never invokes the provider", async () => {
  const events: string[] = []
  const { adapter, store } = createStore()
  adapter.failTransitionNumber = 1
  installDependencies(baseDependencies(store, events))

  const response = await contentRunsPost(postRequest())
  const body = await response.json()
  const runs = await store.listForOwner(customer.subject)

  assert.equal(response.status, 503)
  assert.equal(body.code, "RUN_STAGE_FAILED_REFUNDED")
  assert.deepEqual(events, ["reserve", "refund"])
  assert.equal(runs[0]?.status, "refunded")
  assert.equal(runs[0]?.output, null)
})

test("provider-output staging failure refunds before credit commit and exposes no output", async () => {
  const events: string[] = []
  const { adapter, store } = createStore()
  adapter.failTransitionNumber = 2
  installDependencies(baseDependencies(store, events))

  const response = await contentRunsPost(postRequest())
  const body = await response.json()
  const runs = await store.listForOwner(customer.subject)

  assert.equal(response.status, 503)
  assert.equal(body.code, "RUN_STAGE_FAILED_REFUNDED")
  assert.deepEqual(events, ["reserve", "provider", "refund"])
  assert.equal(events.includes("commit"), false)
  assert.equal(JSON.stringify(body).includes(validOutput.body), false)
  assert.equal(runs[0]?.status, "refunded")
  assert.equal(runs[0]?.output, null)
})

test("successful Content Agent output is committed, persisted, and returned in that order", async () => {
  const events: string[] = []
  const { store } = createStore()
  installDependencies(baseDependencies(store, events))

  const response = await contentRunsPost(postRequest())
  const body = await response.json()
  const historyResponse = await contentRunsGet(getRequest())
  const history = await historyResponse.json()

  assert.equal(response.status, 200)
  assert.equal(body.ok, true)
  assert.deepEqual(body.run.output, validOutput)
  assert.deepEqual(events, ["reserve", "provider", "commit"])
  assert.equal(historyResponse.status, 200)
  assert.equal(history.runs.length, 1)
  assert.equal(history.runs[0].status, "succeeded")
  assert.equal(history.runs[0].creditState, "committed")
  assert.deepEqual(history.runs[0].output, validOutput)
  assert.equal(JSON.stringify(history).includes(customer.subject), false)
  assert.equal(JSON.stringify(history).includes("content-operation-1234"), false)
})

test("final persistence failure withholds output and a same-key retry safely recovers it", async () => {
  const events: string[] = []
  const { adapter, store } = createStore()
  adapter.failTransitionNumber = 3
  let reserveCalls = 0
  installDependencies({
    ...baseDependencies(store, events),
    reserve: async () => {
      reserveCalls += 1
      events.push("reserve")
      return reserveCalls === 1 ? reservation() : reservation("committed", true)
    },
  })

  const firstResponse = await contentRunsPost(postRequest())
  const firstBody = await firstResponse.json()
  const stagedRuns = await store.listForOwner(customer.subject)

  assert.equal(firstResponse.status, 503)
  assert.equal(firstBody.code, "FINAL_PERSISTENCE_FAILED")
  assert.equal(JSON.stringify(firstBody).includes(validOutput.body), false)
  assert.equal(stagedRuns[0]?.status, "running")
  assert.equal(stagedRuns[0]?.output, null)

  const retryResponse = await contentRunsPost(postRequest())
  const retryBody = await retryResponse.json()

  assert.equal(retryResponse.status, 200)
  assert.equal(retryBody.idempotent, true)
  assert.deepEqual(retryBody.run.output, validOutput)
  assert.equal(events.filter((event) => event === "provider").length, 1)
  assert.equal(events.filter((event) => event === "commit").length, 1)
})

test("a completed idempotent replay returns stored output without another reserve or provider call", async () => {
  const events: string[] = []
  const { store } = createStore()
  installDependencies(baseDependencies(store, events))

  const first = await contentRunsPost(postRequest())
  const second = await contentRunsPost(postRequest())
  const replay = await second.json()

  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  assert.equal(replay.idempotent, true)
  assert.deepEqual(replay.run.output, validOutput)
  assert.deepEqual(events, ["reserve", "provider", "commit"])
})

test("a committed but not yet published run recovers on idempotent retry", async () => {
  const events: string[] = []
  const { adapter, store } = createStore()
  adapter.failTransitionNumber = 3
  let reserveCalls = 0
  installDependencies({
    ...baseDependencies(store, events),
    reserve: async () => {
      events.push("reserve")
      reserveCalls += 1
      return reserveCalls === 1
        ? reservation("reserved", false)
        : reservation("committed", true)
    },
  })

  const first = await contentRunsPost(postRequest())
  const firstBody = await first.json()
  const stagedHistory = await store.listForOwner(customer.subject)
  const second = await contentRunsPost(postRequest())
  const secondBody = await second.json()

  assert.equal(first.status, 503)
  assert.equal(firstBody.code, "FINAL_PERSISTENCE_FAILED")
  assert.equal(JSON.stringify(firstBody).includes(validOutput.body), false)
  assert.equal(stagedHistory[0]?.status, "running")
  assert.equal(stagedHistory[0]?.output, null)
  assert.equal(second.status, 200)
  assert.equal(secondBody.idempotent, true)
  assert.deepEqual(secondBody.run.output, validOutput)
  assert.deepEqual(events, ["reserve", "provider", "commit", "reserve"])
})

test("credit commit failure withholds output and refunds when the ledger permits", async () => {
  const events: string[] = []
  const { store } = createStore()
  installDependencies({
    ...baseDependencies(store, events),
    commit: async () => {
      events.push("commit")
      throw new Error("commit detail must not escape")
    },
  })

  const response = await contentRunsPost(postRequest())
  const body = await response.json()
  const runs = await store.listForOwner(customer.subject)

  assert.equal(response.status, 503)
  assert.equal(body.code, "CREDIT_COMMIT_FAILED_REFUNDED")
  assert.equal(JSON.stringify(body).includes(validOutput.body), false)
  assert.deepEqual(events, ["reserve", "provider", "commit", "refund"])
  assert.equal(runs[0]?.status, "refunded")
  assert.equal(runs[0]?.output, null)
})

test("credit commit and refund failure is distinct and leaves output quarantined", async () => {
  const events: string[] = []
  const { store } = createStore()
  installDependencies({
    ...baseDependencies(store, events),
    commit: async () => {
      events.push("commit")
      throw new Error("commit unavailable")
    },
    refund: async () => {
      events.push("refund")
      throw new Error("refund unavailable")
    },
  })

  const response = await contentRunsPost(postRequest())
  const body = await response.json()
  const runs = await store.listForOwner(customer.subject)

  assert.equal(response.status, 503)
  assert.equal(body.code, "CREDIT_COMMIT_AND_REFUND_FAILED")
  assert.deepEqual(events, ["reserve", "provider", "commit", "refund"])
  assert.equal(JSON.stringify(body).includes(validOutput.body), false)
  assert.equal(runs[0]?.output, null)
  assert.equal(runs[0]?.status, "reconciliation")
})

test("Content Agent requires an explicit bounded idempotency key", async () => {
  const events: string[] = []
  const { store } = createStore()
  installDependencies(baseDependencies(store, events))
  const request = new NextRequest("http://127.0.0.1:3000/api/content-agent/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(validInput),
  })

  const response = await contentRunsPost(request)
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.equal(body.code, "INVALID_IDEMPOTENCY_KEY")
  assert.deepEqual(events, [])
})

test("run history is isolated by the stable customer owner subject", async () => {
  const { store } = createStore()
  const ownerA = customerSubject("tenant-a-provider-subject")
  const ownerB = customerSubject("tenant-b-provider-subject")

  await store.claim({
    ownerSubject: ownerA,
    idempotencyKey: "tenant-a-operation-1234",
    content: { ...validInput, goal: "Tenant A topic" },
  })
  await store.claim({
    ownerSubject: ownerB,
    idempotencyKey: "tenant-b-operation-1234",
    content: { ...validInput, goal: "Tenant B topic" },
  })

  const ownerARuns = await store.listForOwner(ownerA)
  const ownerBRuns = await store.listForOwner(ownerB)

  assert.deepEqual(ownerARuns.map((run) => run.input.goal), ["Tenant A topic"])
  assert.deepEqual(ownerBRuns.map((run) => run.input.goal), ["Tenant B topic"])
  assert.equal(JSON.stringify(ownerARuns).includes(ownerB), false)
  assert.equal(JSON.stringify(ownerBRuns).includes(ownerA), false)
})

test("run history retention is bounded to the newest twenty account records", async () => {
  const { adapter, store } = createStore()
  const owner = customerSubject("bounded-history-provider-subject")

  for (let index = 0; index < 25; index += 1) {
    const idempotencyKey = `bounded-operation-${String(index).padStart(4, "0")}`
    await store.claim({
      ownerSubject: owner,
      idempotencyKey,
      content: { ...validInput, goal: `Bounded history item ${index}` },
    })
    await store.transition({
      ownerSubject: owner,
      idempotencyKey,
      expectedStatuses: ["queued"],
      status: "failed",
      creditState: "not_reserved",
      pendingOutput: null,
      output: null,
      errorCode: "CREDITS_REQUIRED",
    })
  }

  const runs = await store.listForOwner(owner, 50)
  assert.equal(runs.length, 20)
  assert.equal(runs[0]?.input.goal, "Bounded history item 24")
  assert.equal(runs.at(-1)?.input.goal, "Bounded history item 5")
  assert.ok((adapter.retentionFor("bounded-operation-0024") ?? 0) > 0)
})

test("retention never expires or count-prunes unresolved financial states", async () => {
  const { adapter, store } = createStore()
  const owner = customerSubject("unresolved-retention-provider-subject")
  const unresolvedKey = "unresolved-operation-0001"

  await store.claim({
    ownerSubject: owner,
    idempotencyKey: unresolvedKey,
    content: { ...validInput, goal: "Requires financial reconciliation" },
  })
  assert.equal(adapter.retentionFor(unresolvedKey), null)
  await store.transition({
    ownerSubject: owner,
    idempotencyKey: unresolvedKey,
    expectedStatuses: ["queued"],
    status: "running",
    creditState: "reserved",
    pendingOutput: null,
    output: null,
    errorCode: null,
  })
  assert.equal(adapter.retentionFor(unresolvedKey), null)
  await store.transition({
    ownerSubject: owner,
    idempotencyKey: unresolvedKey,
    expectedStatuses: ["running"],
    status: "reconciliation",
    creditState: "reconciliation",
    pendingOutput: null,
    output: null,
    errorCode: "STALE_RUN_RECONCILIATION_REQUIRED",
  })

  for (let index = 0; index < 25; index += 1) {
    const idempotencyKey = `resolved-operation-${String(index).padStart(4, "0")}`
    await store.claim({
      ownerSubject: owner,
      idempotencyKey,
      content: { ...validInput, goal: `Resolved history item ${index}` },
    })
    await store.transition({
      ownerSubject: owner,
      idempotencyKey,
      expectedStatuses: ["queued"],
      status: "failed",
      creditState: "not_reserved",
      pendingOutput: null,
      output: null,
      errorCode: "CREDITS_REQUIRED",
    })
  }

  const replay = await store.claim({
    ownerSubject: owner,
    idempotencyKey: unresolvedKey,
    content: { ...validInput, goal: "Requires financial reconciliation" },
  })
  assert.equal(replay.created, false)
  assert.equal(replay.record.status, "reconciliation")
  assert.equal(adapter.retentionFor(unresolvedKey), null)
})

test("run history skips expired records without hiding valid account history", async () => {
  const { adapter, store } = createStore()
  const owner = customerSubject("stale-history-provider-subject")

  await store.claim({
    ownerSubject: owner,
    idempotencyKey: "stale-history-operation-1234",
    content: { ...validInput, goal: "Still available" },
  })
  adapter.includeMissingListRecord = true

  const runs = await store.listForOwner(owner)
  assert.deepEqual(runs.map((run) => run.input.goal), ["Still available"])
})
