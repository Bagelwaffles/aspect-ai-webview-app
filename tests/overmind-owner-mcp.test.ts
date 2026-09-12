import assert from "node:assert/strict"
import test from "node:test"

import {
  OWNER_OVERMIND_TOOLS,
  handleOwnerOvermindTool,
  type OwnerMcpDependencies,
} from "../lib/server/overmind-owner-mcp"
import type { OvermindTask } from "../lib/server/overmind-task-store"

const task: OvermindTask = {
  id: "11111111-1111-4111-8111-111111111111",
  objective: "Prepare a controlled owner task without executing it.",
  action: {
    agentSlug: "content-agent",
    mode: "draft",
    operation: "draft-copy",
    target: "private-workspace",
    summary: "Draft a private marketing artifact.",
    parameters: {},
  },
  actionDigest: "a".repeat(64),
  status: "ready",
  approvalRequired: false,
  executionEligible: true,
  createdAt: "2026-09-11T22:40:00.000Z",
  updatedAt: "2026-09-11T22:40:00.000Z",
  approvedAt: null,
  approvalExpiresAt: null,
  approvalActorHash: null,
  rejectedAt: null,
  rejectionActorHash: null,
  cancelledAt: null,
  cancellationActorHash: null,
}

const dependencies: OwnerMcpDependencies = {
  listTasks: async () => [task],
  getTask: async () => task,
  listAudit: async () => [],
  createTask: async () => task,
  approveTask: async () => ({
    ...task,
    status: "approved",
    approvalRequired: true,
    approvedAt: "2026-09-11T22:41:00.000Z",
    approvalExpiresAt: "2026-09-11T22:56:00.000Z",
    approvalActorHash: "b".repeat(64),
  }),
  rejectTask: async () => ({
    ...task,
    status: "rejected",
    executionEligible: false,
    rejectedAt: "2026-09-11T22:41:30.000Z",
    rejectionActorHash: "e".repeat(64),
  }),
  cancelTask: async () => ({
    ...task,
    status: "cancelled",
    executionEligible: false,
    cancelledAt: "2026-09-11T22:42:00.000Z",
    cancellationActorHash: "c".repeat(64),
  }),
}

test("owner MCP exposes task ledger controls but no execute tool", () => {
  const names = OWNER_OVERMIND_TOOLS.map((tool) => tool.name)
  assert.deepEqual(names, [
    "ams_owner_list_tasks",
    "ams_owner_get_task",
    "ams_owner_create_task",
    "ams_owner_approve_task",
    "ams_owner_reject_task",
    "ams_owner_cancel_task",
  ])
  assert.equal(names.some((name) => /execute|publish|send|bill|delete|deploy/i.test(name)), false)
  assert.equal(OWNER_OVERMIND_TOOLS.find((tool) => tool.name === "ams_owner_list_tasks")?.requiredScope, "overmind.read")
  assert.equal(OWNER_OVERMIND_TOOLS.find((tool) => tool.name === "ams_owner_approve_task")?.requiredScope, "overmind.control")
  assert.equal(OWNER_OVERMIND_TOOLS.find((tool) => tool.name === "ams_owner_create_task")?.annotations.idempotentHint, true)
  assert.equal(OWNER_OVERMIND_TOOLS.find((tool) => tool.name === "ams_owner_approve_task")?.annotations.idempotentHint, false)
  assert.equal(OWNER_OVERMIND_TOOLS.find((tool) => tool.name === "ams_owner_reject_task")?.annotations.idempotentHint, true)
  assert.equal(OWNER_OVERMIND_TOOLS.find((tool) => tool.name === "ams_owner_cancel_task")?.annotations.idempotentHint, true)
})

test("owner MCP mutations always report that no execution occurred", async () => {
  const actor = `customer:google:${"d".repeat(64)}`

  const created = await handleOwnerOvermindTool(
    "ams_owner_create_task",
    { objective: task.objective, action: task.action, idempotencyKey: "owner-test-create-001" },
    actor,
    dependencies,
  )
  assert.equal(created.ok, true)
  assert.equal(created.executionPerformed, false)

  const approved = await handleOwnerOvermindTool(
    "ams_owner_approve_task",
    {
      taskId: task.id,
      actionDigest: task.actionDigest,
      confirmation: "APPROVE_OVERMIND_TASK",
      expiresInMinutes: 15,
    },
    actor,
    dependencies,
  )
  assert.equal(approved.ok, true)
  assert.equal(approved.executionPerformed, false)

  const rejected = await handleOwnerOvermindTool(
    "ams_owner_reject_task",
    { taskId: task.id, confirmation: "REJECT_OVERMIND_TASK" },
    actor,
    dependencies,
  )
  assert.equal(rejected.ok, true)
  assert.equal(rejected.executionPerformed, false)

  const cancelled = await handleOwnerOvermindTool(
    "ams_owner_cancel_task",
    { taskId: task.id, confirmation: "CANCEL_OVERMIND_TASK" },
    actor,
    dependencies,
  )
  assert.equal(cancelled.ok, true)
  assert.equal(cancelled.executionPerformed, false)
})

test("create requires an idempotency key and reject requires exact confirmation", async () => {
  const actor = `customer:google:${"d".repeat(64)}`

  const missingIdempotency = await handleOwnerOvermindTool(
    "ams_owner_create_task",
    { objective: task.objective, action: task.action },
    actor,
    dependencies,
  )
  assert.equal(missingIdempotency.ok, false)
  assert.equal(missingIdempotency.error, "INVALID_OWNER_TOOL_INPUT")

  const badReject = await handleOwnerOvermindTool(
    "ams_owner_reject_task",
    { taskId: task.id, confirmation: "YES" },
    actor,
    dependencies,
  )
  assert.equal(badReject.ok, false)
  assert.equal(badReject.error, "INVALID_OWNER_TOOL_INPUT")
})
