import { createHash, randomUUID } from "node:crypto"

import { Redis } from "@upstash/redis"
import { z } from "zod"

import { getAgentContract } from "@/lib/agent-contract-registry"
import type { AgentContract } from "@/lib/agent-contract"

const TASK_PREFIX = "ams:overmind:v1:task"
const TASK_INDEX_KEY = "ams:overmind:v1:task-index"
const MAX_TASKS = 200
const MAX_AUDIT_EVENTS = 200

export const overmindActionModeSchema = z.enum(["read", "draft", "write", "publish", "billing"])

const actionParameterSchema = z.union([
  z.string().max(2_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
])

const idempotencyKeySchema = z.string().trim().min(8).max(200).regex(/^[A-Za-z0-9._:-]+$/)

export const overmindActionDescriptorSchema = z
  .object({
    agentSlug: z.string().trim().min(1).max(120),
    mode: overmindActionModeSchema,
    operation: z.string().trim().min(1).max(160),
    target: z.string().trim().min(1).max(500),
    summary: z.string().trim().min(1).max(1_000),
    parameters: z.record(z.string().min(1).max(120), actionParameterSchema).default({}),
  })
  .strict()
  .superRefine((value, context) => {
    const keys = Object.keys(value.parameters)
    if (keys.length > 50) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "OVERMIND_ACTION_TOO_MANY_PARAMETERS" })
    }
    const secretLike = keys.find((key) =>
      /(^|[_-])(secret|password|passphrase|token|api[_-]?key|private[_-]?key|client[_-]?secret|credential)([_-]|$)/i.test(key),
    )
    if (secretLike) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "OVERMIND_ACTION_SECRET_PARAMETER_REJECTED" })
    }
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > 16_384) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "OVERMIND_ACTION_TOO_LARGE" })
    }
  })

export type OvermindActionDescriptor = z.infer<typeof overmindActionDescriptorSchema>

export const overmindTaskSchema = z
  .object({
    id: z.string().uuid(),
    objective: z.string().trim().min(10).max(2_000),
    action: overmindActionDescriptorSchema,
    actionDigest: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(["planned", "ready", "pending_approval", "approved", "rejected", "cancelled"]),
    approvalRequired: z.boolean(),
    executionEligible: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    approvedAt: z.string().datetime().nullable(),
    approvalExpiresAt: z.string().datetime().nullable(),
    approvalActorHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    rejectedAt: z.string().datetime().nullable().default(null),
    rejectionActorHash: z.string().regex(/^[a-f0-9]{64}$/).nullable().default(null),
    cancelledAt: z.string().datetime().nullable(),
    cancellationActorHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  })
  .strict()

export type OvermindTask = z.infer<typeof overmindTaskSchema>

const auditEventSchema = z
  .object({
    id: z.string().uuid(),
    taskId: z.string().uuid(),
    type: z.enum(["task.created", "task.approved", "task.rejected", "task.cancelled"]),
    actorHash: z.string().regex(/^[a-f0-9]{64}$/),
    at: z.string().datetime(),
    actionDigest: z.string().regex(/^[a-f0-9]{64}$/),
    detail: z.string().max(500),
  })
  .strict()

export type OvermindTaskAuditEvent = z.infer<typeof auditEventSchema>

type RedisLike = {
  get<T = unknown>(key: string): Promise<T | null>
  set(key: string, value: string, options?: { nx?: boolean }): Promise<unknown>
  lpush(key: string, ...values: string[]): Promise<unknown>
  ltrim(key: string, start: number, stop: number): Promise<unknown>
  lrange<T = unknown>(key: string, start: number, stop: number): Promise<T[]>
}

type StoreOptions = {
  redis?: RedisLike | null
  env?: NodeJS.ProcessEnv
  now?: () => Date
  id?: () => string
  resolveContract?: (slug: string) => AgentContract | null
}

function clean(value: string | undefined) {
  const result = value?.trim()
  return result || null
}

function resolveRedis(env: NodeJS.ProcessEnv = process.env): RedisLike | null {
  const url = clean(env.UPSTASH_REDIS_REST_URL) ?? clean(env.KV_REST_API_URL)
  const token = clean(env.UPSTASH_REDIS_REST_TOKEN) ?? clean(env.KV_REST_API_TOKEN)
  return url && token ? new Redis({ url, token }) : null
}

function runtimeRedis(options: StoreOptions) {
  if (Object.prototype.hasOwnProperty.call(options, "redis")) return options.redis ?? null
  return resolveRedis(options.env ?? process.env)
}

function taskKey(id: string) {
  return `${TASK_PREFIX}:${id}`
}

function auditKey(id: string) {
  return `${TASK_PREFIX}:${id}:audit`
}

function actorHash(subject: string) {
  return createHash("sha256").update(subject).digest("hex")
}

function deterministicTaskId(actorSubject: string, idempotencyKey: string) {
  const hex = createHash("sha256")
    .update(`overmind-task\u0000${actorSubject}\u0000${idempotencyKey}`)
    .digest("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
    .join(",")}}`
}

export function overmindActionDigest(action: OvermindActionDescriptor) {
  return createHash("sha256").update(canonical(overmindActionDescriptorSchema.parse(action))).digest("hex")
}

function approvalRequired(mode: OvermindActionDescriptor["mode"]) {
  return mode === "write" || mode === "publish" || mode === "billing"
}

function permissionFor(contract: AgentContract, mode: OvermindActionDescriptor["mode"]) {
  return contract.permissions.find((permission) => permission.mode === mode) ?? null
}

function resolveContract(slug: string, options: StoreOptions) {
  return (options.resolveContract ?? getAgentContract)(slug)
}

function parseTask(raw: unknown): OvermindTask | null {
  if (raw === null || raw === undefined) return null
  let candidate = raw
  if (typeof raw === "string") {
    try {
      candidate = JSON.parse(raw)
    } catch {
      return null
    }
  }
  const parsed = overmindTaskSchema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

function parseAudit(raw: unknown): OvermindTaskAuditEvent | null {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw)
    } catch {
      return null
    }
  }
  const parsed = auditEventSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

async function recordAudit(
  redis: RedisLike,
  task: OvermindTask,
  type: OvermindTaskAuditEvent["type"],
  actorSubject: string,
  detail: string,
  options: StoreOptions,
) {
  const event = auditEventSchema.parse({
    id: (options.id ?? randomUUID)(),
    taskId: task.id,
    type,
    actorHash: actorHash(actorSubject),
    at: task.updatedAt,
    actionDigest: task.actionDigest,
    detail,
  })
  await redis.lpush(auditKey(task.id), JSON.stringify(event))
  await redis.ltrim(auditKey(task.id), 0, MAX_AUDIT_EVENTS - 1)
}

export function overmindTaskApprovalValid(task: OvermindTask, now = new Date()) {
  return (
    task.status === "approved" &&
    task.approvedAt !== null &&
    task.approvalExpiresAt !== null &&
    Date.parse(task.approvalExpiresAt) > now.getTime()
  )
}

export async function createOvermindTask(
  input: { objective: string; action: unknown; idempotencyKey?: string },
  actorSubject: string,
  options: StoreOptions = {},
) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("OVERMIND_TASK_STORE_UNAVAILABLE")

  const action = overmindActionDescriptorSchema.parse(input.action)
  const objective = z.string().trim().min(10).max(2_000).parse(input.objective)
  const idempotencyKey = input.idempotencyKey === undefined ? null : idempotencyKeySchema.parse(input.idempotencyKey)
  const actionDigest = overmindActionDigest(action)
  const contract = resolveContract(action.agentSlug, options)
  if (!contract) throw new Error("OVERMIND_AGENT_NOT_REGISTERED")

  const permission = permissionFor(contract, action.mode)
  if (!permission) throw new Error("OVERMIND_PERMISSION_NOT_DECLARED")

  const requiresApproval = approvalRequired(action.mode)
  if (requiresApproval && permission.approval === "none") {
    throw new Error("OVERMIND_MUTATION_APPROVAL_POLICY_INVALID")
  }
  if (action.mode === "billing" && permission.approval !== "owner") {
    throw new Error("OVERMIND_BILLING_OWNER_APPROVAL_REQUIRED")
  }

  const taskId = idempotencyKey
    ? deterministicTaskId(actorSubject, idempotencyKey)
    : (options.id ?? randomUUID)()

  if (idempotencyKey) {
    const existing = parseTask(await redis.get<unknown>(taskKey(taskId)))
    if (existing) {
      if (existing.actionDigest !== actionDigest || existing.objective !== objective) {
        throw new Error("OVERMIND_IDEMPOTENCY_CONFLICT")
      }
      return existing
    }
  }

  const eligible = contract.status === "live"
  const now = (options.now ?? (() => new Date()))().toISOString()
  const status: OvermindTask["status"] = !eligible
    ? "planned"
    : requiresApproval
      ? "pending_approval"
      : "ready"

  const task = overmindTaskSchema.parse({
    id: taskId,
    objective,
    action,
    actionDigest,
    status,
    approvalRequired: requiresApproval,
    executionEligible: eligible,
    createdAt: now,
    updatedAt: now,
    approvedAt: null,
    approvalExpiresAt: null,
    approvalActorHash: null,
    rejectedAt: null,
    rejectionActorHash: null,
    cancelledAt: null,
    cancellationActorHash: null,
  })

  if (idempotencyKey) {
    const claimed = await redis.set(taskKey(task.id), JSON.stringify(task), { nx: true })
    if (claimed === null) {
      const existing = parseTask(await redis.get<unknown>(taskKey(task.id)))
      if (!existing) throw new Error("OVERMIND_IDEMPOTENCY_STATE_UNAVAILABLE")
      if (existing.actionDigest !== actionDigest || existing.objective !== objective) {
        throw new Error("OVERMIND_IDEMPOTENCY_CONFLICT")
      }
      return existing
    }
  } else {
    await redis.set(taskKey(task.id), JSON.stringify(task))
  }

  await redis.lpush(TASK_INDEX_KEY, task.id)
  await redis.ltrim(TASK_INDEX_KEY, 0, MAX_TASKS - 1)
  await recordAudit(redis, task, "task.created", actorSubject, `Created with status ${task.status}.`, options)
  return task
}

export async function getOvermindTask(id: string, options: StoreOptions = {}) {
  if (!z.string().uuid().safeParse(id).success) return null
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("OVERMIND_TASK_STORE_UNAVAILABLE")
  return parseTask(await redis.get<unknown>(taskKey(id)))
}

export async function listOvermindTasks(options: StoreOptions = {}) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("OVERMIND_TASK_STORE_UNAVAILABLE")
  const ids = await redis.lrange<string>(TASK_INDEX_KEY, 0, MAX_TASKS - 1)
  const tasks: OvermindTask[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    const normalizedId = String(id)
    if (seen.has(normalizedId)) continue
    seen.add(normalizedId)
    const task = parseTask(await redis.get<unknown>(taskKey(normalizedId)))
    if (task) tasks.push(task)
  }
  return tasks
}

export async function listOvermindTaskAudit(id: string, options: StoreOptions = {}) {
  if (!z.string().uuid().safeParse(id).success) return []
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("OVERMIND_TASK_STORE_UNAVAILABLE")
  const rows = await redis.lrange<unknown>(auditKey(id), 0, MAX_AUDIT_EVENTS - 1)
  return rows.map(parseAudit).filter(Boolean) as OvermindTaskAuditEvent[]
}

export async function approveOvermindTask(
  id: string,
  input: { actionDigest: string; expiresInMinutes?: number },
  actorSubject: string,
  options: StoreOptions = {},
) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("OVERMIND_TASK_STORE_UNAVAILABLE")
  const task = await getOvermindTask(id, { ...options, redis })
  if (!task) throw new Error("OVERMIND_TASK_NOT_FOUND")
  if (task.status === "cancelled") throw new Error("OVERMIND_TASK_CANCELLED")
  if (task.status === "rejected") throw new Error("OVERMIND_TASK_REJECTED")
  if (!task.approvalRequired) throw new Error("OVERMIND_TASK_APPROVAL_NOT_REQUIRED")
  if (task.actionDigest !== input.actionDigest) throw new Error("OVERMIND_ACTION_DIGEST_MISMATCH")

  const nowDate = (options.now ?? (() => new Date()))()
  if (overmindTaskApprovalValid(task, nowDate)) return task

  const contract = resolveContract(task.action.agentSlug, options)
  if (!contract || contract.status !== "live") throw new Error("OVERMIND_AGENT_NOT_LIVE")
  const permission = permissionFor(contract, task.action.mode)
  if (!permission || permission.approval === "none") throw new Error("OVERMIND_APPROVAL_POLICY_INVALID")
  if (task.action.mode === "billing" && permission.approval !== "owner") {
    throw new Error("OVERMIND_BILLING_OWNER_APPROVAL_REQUIRED")
  }

  const minutes = z.number().int().min(1).max(30).parse(input.expiresInMinutes ?? 15)
  const approved = overmindTaskSchema.parse({
    ...task,
    status: "approved",
    executionEligible: true,
    updatedAt: nowDate.toISOString(),
    approvedAt: nowDate.toISOString(),
    approvalExpiresAt: new Date(nowDate.getTime() + minutes * 60_000).toISOString(),
    approvalActorHash: actorHash(actorSubject),
    rejectedAt: null,
    rejectionActorHash: null,
  })
  await redis.set(taskKey(id), JSON.stringify(approved))
  await recordAudit(redis, approved, "task.approved", actorSubject, `Approval expires in ${minutes} minutes.`, options)
  return approved
}

export async function rejectOvermindTask(
  id: string,
  actorSubject: string,
  options: StoreOptions = {},
) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("OVERMIND_TASK_STORE_UNAVAILABLE")
  const task = await getOvermindTask(id, { ...options, redis })
  if (!task) throw new Error("OVERMIND_TASK_NOT_FOUND")
  if (task.status === "rejected") return task
  if (task.status === "cancelled") throw new Error("OVERMIND_TASK_CANCELLED")
  if (task.status === "approved") throw new Error("OVERMIND_TASK_ALREADY_APPROVED")
  if (!task.approvalRequired) throw new Error("OVERMIND_TASK_REJECTION_NOT_REQUIRED")

  const now = (options.now ?? (() => new Date()))().toISOString()
  const rejected = overmindTaskSchema.parse({
    ...task,
    status: "rejected",
    executionEligible: false,
    updatedAt: now,
    approvedAt: null,
    approvalExpiresAt: null,
    approvalActorHash: null,
    rejectedAt: now,
    rejectionActorHash: actorHash(actorSubject),
  })
  await redis.set(taskKey(id), JSON.stringify(rejected))
  await recordAudit(redis, rejected, "task.rejected", actorSubject, "Task rejected before execution.", options)
  return rejected
}

export async function cancelOvermindTask(
  id: string,
  actorSubject: string,
  options: StoreOptions = {},
) {
  const redis = runtimeRedis(options)
  if (!redis) throw new Error("OVERMIND_TASK_STORE_UNAVAILABLE")
  const task = await getOvermindTask(id, { ...options, redis })
  if (!task) throw new Error("OVERMIND_TASK_NOT_FOUND")
  if (task.status === "cancelled") return task
  if (task.status === "rejected") throw new Error("OVERMIND_TASK_REJECTED")

  const now = (options.now ?? (() => new Date()))().toISOString()
  const cancelled = overmindTaskSchema.parse({
    ...task,
    status: "cancelled",
    executionEligible: false,
    updatedAt: now,
    cancelledAt: now,
    cancellationActorHash: actorHash(actorSubject),
  })
  await redis.set(taskKey(id), JSON.stringify(cancelled))
  await recordAudit(redis, cancelled, "task.cancelled", actorSubject, "Task cancelled before execution.", options)
  return cancelled
}
