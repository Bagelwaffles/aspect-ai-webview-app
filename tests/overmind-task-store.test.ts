import assert from "node:assert/strict"
import test from "node:test"

import { getAgentContract } from "../lib/agent-contract-registry"
import {
  approveOvermindTask,
  cancelOvermindTask,
  createOvermindTask,
  listOvermindTaskAudit,
  overmindActionDescriptorSchema,
  overmindTaskApprovalValid,
} from "../lib/server/overmind-task-store"

class FakeRedis {
  readonly strings = new Map<string, string>()
  readonly lists = new Map<string, string[]>()

  async get<T = unknown>(key: string): Promise<T | null> {
    return (this.strings.get(key) ?? null) as T | null
  }

  async set(key: string, value: string) {
    this.strings.set(key, value)
    return "OK"
  }

  async lpush(key: string, ...values: string[]) {
    const current = this.lists.get(key) ?? []
    this.lists.set(key, [...values, ...current])
    return this.lists.get(key)?.length ?? 0
  }

  async ltrim(key: string, start: number, stop: number) {
    const current = this.lists.get(key) ?? []
    this.lists.set(key, current.slice(start, stop + 1))
    return "OK"
  }

  async lrange<T = unknown>(key: string, start: number, stop: number): Promise<T[]> {
    const current = this.lists.get(key) ?? []
    return current.slice(start, stop + 1) as T[]
  }
}

const actor = `customer:google:${"f".repeat(64)}`

function idFactory() {
  const ids = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
    "44444444-4444-4444-8444-444444444444",
    "55555555-5555-4555-8555-555555555555",
  ]
  return () => ids.shift() ?? "99999999-9999-4999-8999-999999999999"
}

test("task action descriptors reject secret-bearing parameters", () => {
  assert.equal(
    overmindActionDescriptorSchema.safeParse({
      agentSlug: "content-agent",
      mode: "draft",
      operation: "generate",
      target: "customer-workspace",
      summary: "Generate a private draft.",
      parameters: { api_key: "do-not-store-this" },
    }).success,
    false,
  )
})

test("live draft work is recorded as ready but never represented as executed", async () => {
  const redis = new FakeRedis()
  const task = await createOvermindTask(
    {
      objective: "Create a private marketing draft for the approved customer brief.",
      action: {
        agentSlug: "content-agent",
        mode: "draft",
        operation: "generate-content-draft",
        target: "customer-workspace",
        summary: "Generate one private content draft.",
        parameters: { format: "social-post" },
      },
    },
    actor,
    { redis, id: idFactory(), now: () => new Date("2026-09-11T19:45:00.000Z") },
  )

  assert.equal(task.status, "ready")
  assert.equal(task.approvalRequired, false)
  assert.equal(task.executionEligible, true)
  assert.match(task.actionDigest, /^[a-f0-9]{64}$/)
})

test("non-live action agent can be planned but cannot receive execution approval", async () => {
  const redis = new FakeRedis()
  const ids = idFactory()
  const task = await createOvermindTask(
    {
      objective: "Prepare one exact social publishing action for later operator approval.",
      action: {
        agentSlug: "social-publisher-agent",
        mode: "write",
        operation: "publish-approved-post",
        target: "linkedin:organization",
        summary: "Publish one already-reviewed organization post.",
        parameters: { postId: "draft-123" },
      },
    },
    actor,
    { redis, id: ids, now: () => new Date("2026-09-11T19:45:00.000Z") },
  )

  assert.equal(task.status, "planned")
  assert.equal(task.approvalRequired, true)
  assert.equal(task.executionEligible, false)
  await assert.rejects(
    () => approveOvermindTask(task.id, { actionDigest: task.actionDigest }, actor, { redis }),
    /OVERMIND_AGENT_NOT_LIVE/,
  )
})

test("approval is bound to the exact action digest, expires, audits, and can be cancelled", async () => {
  const redis = new FakeRedis()
  const ids = idFactory()
  const social = getAgentContract("social-publisher-agent")
  assert.ok(social)
  const resolveContract = (slug: string) =>
    slug === "social-publisher-agent"
      ? {
          ...social,
          status: "live" as const,
          liveProof: { verified: true, evidence: "test fixture", nextMilestone: "monitor" },
        }
      : getAgentContract(slug)

  const task = await createOvermindTask(
    {
      objective: "Publish exactly one reviewed social post to the approved organization target.",
      action: {
        agentSlug: "social-publisher-agent",
        mode: "write",
        operation: "publish-approved-post",
        target: "linkedin:organization:approved",
        summary: "Publish the reviewed post to the approved LinkedIn organization.",
        parameters: { postId: "draft-456" },
      },
    },
    actor,
    {
      redis,
      id: ids,
      resolveContract,
      now: () => new Date("2026-09-11T19:45:00.000Z"),
    },
  )

  assert.equal(task.status, "pending_approval")
  await assert.rejects(
    () =>
      approveOvermindTask(
        task.id,
        { actionDigest: "0".repeat(64) },
        actor,
        { redis, resolveContract },
      ),
    /OVERMIND_ACTION_DIGEST_MISMATCH/,
  )

  const approved = await approveOvermindTask(
    task.id,
    { actionDigest: task.actionDigest, expiresInMinutes: 10 },
    actor,
    {
      redis,
      id: ids,
      resolveContract,
      now: () => new Date("2026-09-11T19:46:00.000Z"),
    },
  )
  assert.equal(approved.status, "approved")
  assert.equal(overmindTaskApprovalValid(approved, new Date("2026-09-11T19:55:59.000Z")), true)
  assert.equal(overmindTaskApprovalValid(approved, new Date("2026-09-11T19:56:01.000Z")), false)

  const cancelled = await cancelOvermindTask(approved.id, actor, {
    redis,
    id: ids,
    now: () => new Date("2026-09-11T19:47:00.000Z"),
  })
  assert.equal(cancelled.status, "cancelled")
  assert.equal(cancelled.executionEligible, false)

  const audit = await listOvermindTaskAudit(task.id, { redis })
  assert.deepEqual(
    audit.map((event) => event.type),
    ["task.cancelled", "task.approved", "task.created"],
  )
})
