import assert from "node:assert/strict"
import test from "node:test"

import { getAgentContract } from "../lib/agent-contract-registry"
import {
  approveOvermindTask,
  createOvermindTask,
  listOvermindTaskAudit,
  rejectOvermindTask,
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
    return (this.lists.get(key) ?? []).slice(start, stop + 1) as T[]
  }
}

const actor = `customer:google:${"a".repeat(64)}`

function liveSocialContract(slug: string) {
  const contract = getAgentContract(slug)
  if (!contract) return null
  return slug === "social-publisher-agent"
    ? {
        ...contract,
        status: "live" as const,
        liveProof: { verified: true, evidence: "test fixture", nextMilestone: "monitor" },
      }
    : contract
}

test("task creation is idempotent for retries and conflicts on changed content", async () => {
  const redis = new FakeRedis()
  const input = {
    objective: "Create one private AMS content draft without external publication.",
    idempotencyKey: "owner-create-20260911-001",
    action: {
      agentSlug: "content-agent",
      mode: "draft",
      operation: "generate-content-draft",
      target: "customer-workspace",
      summary: "Generate one private content draft.",
      parameters: { format: "social-post" },
    },
  }

  const first = await createOvermindTask(input, actor, { redis })
  const retry = await createOvermindTask(input, actor, { redis })
  assert.equal(first.id, retry.id)
  assert.equal(first.actionDigest, retry.actionDigest)

  await assert.rejects(
    () => createOvermindTask({
      ...input,
      action: { ...input.action, summary: "Changed action under the same retry key." },
    }, actor, { redis }),
    /OVERMIND_IDEMPOTENCY_CONFLICT/,
  )
})

test("owner rejection is terminal, audited, and cannot later be approved", async () => {
  const redis = new FakeRedis()
  const task = await createOvermindTask({
    objective: "Prepare one exact social publishing task but do not execute it.",
    idempotencyKey: "owner-reject-20260911-001",
    action: {
      agentSlug: "social-publisher-agent",
      mode: "write",
      operation: "publish-approved-post",
      target: "linkedin:organization:approved",
      summary: "Record one future approved social publishing action.",
      parameters: { postId: "draft-789" },
    },
  }, actor, { redis })

  assert.equal(task.approvalRequired, true)
  const rejected = await rejectOvermindTask(task.id, actor, { redis })
  assert.equal(rejected.status, "rejected")
  assert.equal(rejected.executionEligible, false)

  await assert.rejects(
    () => approveOvermindTask(rejected.id, { actionDigest: rejected.actionDigest }, actor, { redis }),
    /OVERMIND_TASK_REJECTED/,
  )

  const audit = await listOvermindTaskAudit(task.id, { redis })
  assert.deepEqual(audit.map((event) => event.type), ["task.rejected", "task.created"])
})

test("retrying a still-valid approval cannot extend its expiry or duplicate audit", async () => {
  const redis = new FakeRedis()
  const task = await createOvermindTask({
    objective: "Prepare one exact social publishing action for controlled approval testing.",
    idempotencyKey: "owner-approval-20260911-001",
    action: {
      agentSlug: "social-publisher-agent",
      mode: "write",
      operation: "publish-approved-post",
      target: "linkedin:organization:approved",
      summary: "Record one reviewed organization post action.",
      parameters: { postId: "draft-456" },
    },
  }, actor, {
    redis,
    resolveContract: liveSocialContract,
    now: () => new Date("2026-09-11T22:00:00.000Z"),
  })

  const approved = await approveOvermindTask(task.id, { actionDigest: task.actionDigest, expiresInMinutes: 10 }, actor, {
    redis,
    resolveContract: liveSocialContract,
    now: () => new Date("2026-09-11T22:01:00.000Z"),
  })
  const retry = await approveOvermindTask(task.id, { actionDigest: task.actionDigest, expiresInMinutes: 30 }, actor, {
    redis,
    resolveContract: liveSocialContract,
    now: () => new Date("2026-09-11T22:02:00.000Z"),
  })

  assert.equal(retry.approvalExpiresAt, approved.approvalExpiresAt)
  const audit = await listOvermindTaskAudit(task.id, { redis })
  assert.equal(audit.filter((event) => event.type === "task.approved").length, 1)
})
