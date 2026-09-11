import { z } from "zod"

import {
  approveOvermindTask,
  cancelOvermindTask,
  createOvermindTask,
  getOvermindTask,
  listOvermindTaskAudit,
  listOvermindTasks,
} from "@/lib/server/overmind-task-store"

export type OwnerMcpToolDefinition = {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: {
    readOnlyHint: boolean
    destructiveHint: boolean
    idempotentHint: boolean
    openWorldHint: false
  }
  requiredScope: "overmind.read" | "overmind.control"
}

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

const WRITE_SAFE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const

const CANCEL = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const

const ACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["agentSlug", "mode", "operation", "target", "summary"],
  properties: {
    agentSlug: { type: "string", minLength: 1, maxLength: 120 },
    mode: { type: "string", enum: ["read", "draft", "write", "publish", "billing"] },
    operation: { type: "string", minLength: 1, maxLength: 160 },
    target: { type: "string", minLength: 1, maxLength: 500 },
    summary: { type: "string", minLength: 1, maxLength: 1000 },
    parameters: {
      type: "object",
      maxProperties: 50,
      additionalProperties: {
        anyOf: [{ type: "string", maxLength: 2000 }, { type: "number" }, { type: "boolean" }, { type: "null" }],
      },
    },
  },
} as const

export const OWNER_OVERMIND_TOOLS: OwnerMcpToolDefinition[] = [
  {
    name: "ams_owner_list_tasks",
    title: "List Overmind tasks",
    description: "List durable owner Overmind task records. Read-only; never executes a task.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    annotations: READ_ONLY,
    requiredScope: "overmind.read",
  },
  {
    name: "ams_owner_get_task",
    title: "Get Overmind task",
    description: "Read one durable Overmind task and its append-oriented audit history. Read-only.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["taskId"],
      properties: { taskId: { type: "string", format: "uuid" } },
    },
    annotations: READ_ONLY,
    requiredScope: "overmind.read",
  },
  {
    name: "ams_owner_create_task",
    title: "Create Overmind task",
    description:
      "Create a durable task record for an exact AMS agent action. This records intent only and never executes the action or contacts an external system.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["objective", "action"],
      properties: {
        objective: { type: "string", minLength: 10, maxLength: 2000 },
        action: ACTION_SCHEMA,
      },
    },
    annotations: WRITE_SAFE,
    requiredScope: "overmind.control",
  },
  {
    name: "ams_owner_approve_task",
    title: "Approve Overmind task",
    description:
      "Approve one exact task action digest for a short expiry window. Approval changes only AMS task state; no executor is registered and no external action is performed.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["taskId", "actionDigest", "confirmation"],
      properties: {
        taskId: { type: "string", format: "uuid" },
        actionDigest: { type: "string", pattern: "^[a-f0-9]{64}$" },
        confirmation: { type: "string", const: "APPROVE_OVERMIND_TASK" },
        expiresInMinutes: { type: "integer", minimum: 1, maximum: 30 },
      },
    },
    annotations: WRITE_SAFE,
    requiredScope: "overmind.control",
  },
  {
    name: "ams_owner_cancel_task",
    title: "Cancel Overmind task",
    description: "Cancel a durable Overmind task before execution. This is idempotent and does not call any external system.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["taskId", "confirmation"],
      properties: {
        taskId: { type: "string", format: "uuid" },
        confirmation: { type: "string", const: "CANCEL_OVERMIND_TASK" },
      },
    },
    annotations: CANCEL,
    requiredScope: "overmind.control",
  },
]

const taskIdSchema = z.string().uuid()
const approveSchema = z
  .object({
    taskId: taskIdSchema,
    actionDigest: z.string().regex(/^[a-f0-9]{64}$/),
    confirmation: z.literal("APPROVE_OVERMIND_TASK"),
    expiresInMinutes: z.number().int().min(1).max(30).optional(),
  })
  .strict()
const cancelSchema = z
  .object({ taskId: taskIdSchema, confirmation: z.literal("CANCEL_OVERMIND_TASK") })
  .strict()
const createSchema = z
  .object({
    objective: z.string().trim().min(10).max(2_000),
    action: z.record(z.unknown()),
  })
  .strict()

export type OwnerMcpDependencies = {
  listTasks: typeof listOvermindTasks
  getTask: typeof getOvermindTask
  listAudit: typeof listOvermindTaskAudit
  createTask: typeof createOvermindTask
  approveTask: typeof approveOvermindTask
  cancelTask: typeof cancelOvermindTask
}

const DEFAULT_DEPENDENCIES: OwnerMcpDependencies = {
  listTasks: listOvermindTasks,
  getTask: getOvermindTask,
  listAudit: listOvermindTaskAudit,
  createTask: createOvermindTask,
  approveTask: approveOvermindTask,
  cancelTask: cancelOvermindTask,
}

function objectArgs(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

export function ownerToolDefinition(name: string) {
  return OWNER_OVERMIND_TOOLS.find((tool) => tool.name === name) ?? null
}

export async function handleOwnerOvermindTool(
  name: string,
  rawArguments: unknown,
  actorSubject: string,
  dependencies: OwnerMcpDependencies = DEFAULT_DEPENDENCIES,
): Promise<Record<string, unknown>> {
  const args = objectArgs(rawArguments)

  try {
    if (name === "ams_owner_list_tasks") {
      return { ok: true, tasks: await dependencies.listTasks(), executionPerformed: false }
    }

    if (name === "ams_owner_get_task") {
      const taskId = taskIdSchema.parse(args.taskId)
      const task = await dependencies.getTask(taskId)
      if (!task) return { ok: false, error: "OVERMIND_TASK_NOT_FOUND", executionPerformed: false }
      return {
        ok: true,
        task,
        audit: await dependencies.listAudit(taskId),
        executionPerformed: false,
      }
    }

    if (name === "ams_owner_create_task") {
      const input = createSchema.parse(args)
      const task = await dependencies.createTask(input, actorSubject)
      return { ok: true, task, executionPerformed: false }
    }

    if (name === "ams_owner_approve_task") {
      const input = approveSchema.parse(args)
      const task = await dependencies.approveTask(
        input.taskId,
        { actionDigest: input.actionDigest, expiresInMinutes: input.expiresInMinutes },
        actorSubject,
      )
      return { ok: true, task, executionPerformed: false }
    }

    if (name === "ams_owner_cancel_task") {
      const input = cancelSchema.parse(args)
      const task = await dependencies.cancelTask(input.taskId, actorSubject)
      return { ok: true, task, executionPerformed: false }
    }

    return { ok: false, error: "UNKNOWN_OWNER_TOOL", executionPerformed: false }
  } catch (error) {
    const code = error instanceof z.ZodError ? "INVALID_OWNER_TOOL_INPUT" : error instanceof Error ? error.message : "OWNER_TOOL_FAILED"
    return { ok: false, error: code, executionPerformed: false }
  }
}
