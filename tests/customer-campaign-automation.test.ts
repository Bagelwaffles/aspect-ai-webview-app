import assert from "node:assert/strict"
import test from "node:test"

import { NextRequest } from "next/server"
import { customerSubjectFromProviderSubject } from "../lib/auth"
import {
  buildCustomerCampaignPreview,
  customerCampaignAutomationInputSchema,
} from "../lib/server/customer-campaign-automation"
import {
  createCustomerCampaignAutomation,
  listCustomerCampaignAutomations,
  updateCustomerCampaignAutomation,
  type AutomationStoreOptions,
} from "../lib/server/customer-campaign-automation-store"
import {
  GET as listRoute,
  PATCH as updateRoute,
  POST as createRoute,
} from "../app/api/customer/campaign-automations/route"

const now = new Date("2026-10-12T18:00:00.000Z")
const input = {
  idempotencyKey: "review-schedule-0001",
  kind: "email-campaign" as const,
  title: "Welcome series",
  sourceRunId: "content-run-12345678-1234-4123-8123-123456789012",
  startAt: "2026-10-14T14:00:00.000Z",
  sequenceLength: 3 as const,
  cadenceDays: 2 as const,
}
const owner = customerSubjectFromProviderSubject("campaign-owner-A")
const otherOwner = customerSubjectFromProviderSubject("campaign-owner-B")
if (!owner || !otherOwner) throw new Error("Stable test customer subjects required")

test("review plans have bounded UTC step previews and no recipients/senders", () => {
  const dates = buildCustomerCampaignPreview(input, now).map((step) => step.dueAt)
  assert.deepEqual(dates, [
    "2026-10-14T14:00:00.000Z",
    "2026-10-16T14:00:00.000Z",
    "2026-10-18T14:00:00.000Z",
  ])
  assert.equal(customerCampaignAutomationInputSchema.safeParse({
    ...input, recipients: ["unauthorized@example.com"],
  }).success, false)
  assert.throws(() => buildCustomerCampaignPreview({
    ...input, startAt: "2026-10-12T18:01:00.000Z",
  }, now), /OUT_OF_RANGE/)
  assert.throws(() => buildCustomerCampaignPreview({
    ...input, startAt: "2027-05-01T00:00:00.000Z",
  }, now), /OUT_OF_RANGE/)
})

class FakeRedis {
  private data = new Map<string, unknown>()
  private lists = new Map<string, string[]>()
  async get<T = unknown>(key: string): Promise<T | null> {
    return (this.data.get(key) ?? null) as T | null
  }
  async lrange<T = string>(key: string, start: number, end: number): Promise<T[]> {
    return (this.lists.get(key) || []).slice(start, end + 1) as T[]
  }
  async eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown> {
    if (script.includes("LPUSH")) {
      const previous = this.data.get(keys[0]) as string | undefined
      const fingerprint = String(args[0])
      if (previous) {
        if (previous.slice(0, 64) !== fingerprint) return ["conflict"]
        return ["existing", previous.slice(65)]
      }
      this.data.set(keys[0], fingerprint + ":" + String(args[1]))
      this.data.set(keys[1], String(args[1]))
      const list = this.lists.get(keys[2]) || []
      this.lists.set(keys[2], [String(args[3]), ...list].slice(0, Number(args[4])))
      return ["created", String(args[1])]
    }
    const current = this.data.get(keys[0]) as string | undefined
    if (!current) return ["not_found"]
    const currentRecord = JSON.parse(current) as { revision: number; ownerSubject: string }
    if (currentRecord.ownerSubject !== args[0]) return ["forbidden"]
    if (currentRecord.revision !== args[1]) return ["conflict"]
    this.data.set(keys[0], String(args[2]))
    return ["updated", String(args[2])]
  }
}
const redis = new FakeRedis() as unknown as NonNullable<AutomationStoreOptions["redis"]>
const opts: AutomationStoreOptions = {
  redis,
  now: () => now,
  newId: () => "12345678-1234-4123-8123-123456789012",
}

test("customer plan state is durable, idempotent, scoped, and never enables sending", async () => {
  const one = await createCustomerCampaignAutomation(
    owner, input, "2026-10-12T15:00:00.000Z", opts,
  )
  assert.equal(one.created, true)
  assert.equal(one.record.deliveryEnabled, false)
  assert.equal(one.record.recipientCount, 0)
  const same = await createCustomerCampaignAutomation(
    owner, input, "2026-10-12T15:00:00.000Z", opts,
  )
  assert.equal(same.created, false)
  assert.equal(same.record.id, one.record.id)
  await assert.rejects(
    () => createCustomerCampaignAutomation(
      owner, { ...input, title: "Other offer" }, "2026-10-12T15:00:00.000Z", opts,
    ),
    /AUTOMATION_IDEMPOTENCY_CONFLICT/,
  )
  const reviewed = await updateCustomerCampaignAutomation(owner, one.record.id, "review", opts)
  assert.equal(reviewed?.status, "reviewed")
  assert.equal(reviewed?.deliveryEnabled, false)
  const paused = await updateCustomerCampaignAutomation(owner, one.record.id, "pause", opts)
  assert.equal(paused?.status, "paused")
  assert.equal(paused?.deliveryEnabled, false)
  const replay = await createCustomerCampaignAutomation(
    owner, input, "2026-10-12T15:00:00.000Z", opts,
  )
  assert.equal(replay.record.status, "paused")
  assert.equal((await listCustomerCampaignAutomations(otherOwner, opts)).length, 0)
  await assert.rejects(
    () => updateCustomerCampaignAutomation(otherOwner, one.record.id, "review", opts),
    /AUTOMATION_OWNER_MISMATCH/,
  )
  await assert.rejects(
    () => updateCustomerCampaignAutomation(owner, one.record.id, "review", opts),
    /AUTOMATION_INVALID_TRANSITION/,
  )
})

type Injected = typeof globalThis & {
  __amsCustomerCampaignAutomationTestDependencies?: Record<string, unknown>
}
const inject = globalThis as Injected
test.afterEach(() => { delete inject.__amsCustomerCampaignAutomationTestDependencies })

function request(method: "GET" | "POST" | "PATCH", body?: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/customer/campaign-automations", {
    method,
    ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
  })
}
const customer = { kind: "customer" as const, subject: owner, billingEmail: "owner@example.com", email: "owner@example.com" }
const source = {
  id: input.sourceRunId, input: { channel: "email" }, status: "succeeded",
  creditState: "committed", output: { headline: "Welcome" }, updatedAt: now.toISOString(),
}

test("customer API requires a trusted origin, owner run and explicit review", async () => {
  let created = 0
  inject.__amsCustomerCampaignAutomationTestDependencies = {
    authorize: async () => customer,
    trustedOrigin: () => false,
    runStore: () => ({ listForOwner: async () => [source] }),
    create: async () => { created += 1; return { created: true, record: {} } },
  }
  assert.equal((await createRoute(request("POST", input))).status, 403)
  inject.__amsCustomerCampaignAutomationTestDependencies.trustedOrigin = () => true
  inject.__amsCustomerCampaignAutomationTestDependencies.runStore = () => ({ listForOwner: async () => [] })
  const unauthorizedRun = await createRoute(request("POST", input))
  assert.equal(unauthorizedRun.status, 404)
  assert.equal((await unauthorizedRun.json()).code, "SUCCESSFUL_OWNED_RUN_REQUIRED")
  assert.equal(created, 0)
  const review = await updateRoute(request("PATCH", {
    id: "12345678-1234-4123-8123-123456789012", action: "review",
  }))
  assert.equal(review.status, 400)
  assert.equal((await review.json()).code, "REVIEW_CONFIRMATION_REQUIRED")
})

test("customer API never accepts internal bearer auth as customer access", async () => {
  inject.__amsCustomerCampaignAutomationTestDependencies = {
    authorize: async () => null,
    trustedOrigin: () => true,
  }
  assert.equal((await listRoute(request("GET"))).status, 401)
  assert.equal((await createRoute(request("POST", input))).status, 401)
  assert.equal((await updateRoute(request("PATCH", {
    id: "12345678-1234-4123-8123-123456789012", action: "pause",
  }))).status, 401)
})
