import { createHash, randomUUID } from "node:crypto"

import { Redis } from "@upstash/redis"
import { z } from "zod"

import { isStableCustomerSubject } from "@/lib/auth"
import {
  CONTENT_AGENT_VERSION,
  contentAgentIdempotencyKeySchema,
  contentAgentInputSchema,
  contentAgentOutputSchema,
  type ContentAgentInput,
  type ContentAgentOutput,
} from "@/lib/server/content-agent"

export const contentAgentRunStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "refunded",
  "reconciliation",
])

export const contentAgentRunErrorCodeSchema = z.enum([
  "CREDITS_REQUIRED",
  "CREDIT_RESERVATION_FAILED",
  "CREDIT_RESERVATION_REPLAY",
  "RUN_PERSISTENCE_FAILED",
  "CONTENT_PROVIDER_FAILED",
  "CONTENT_PROVIDER_INVALID_RESPONSE",
  "CREDIT_REFUND_FAILED",
  "CREDIT_COMMIT_FAILED",
  "CREDIT_COMMIT_FAILED_REFUNDED",
  "CREDIT_COMMIT_AND_REFUND_FAILED",
  "RUN_STAGE_FAILED_REFUNDED",
  "RUN_STAGE_AND_REFUND_FAILED",
  "FINAL_PERSISTENCE_FAILED",
])

const MAX_RUN_HISTORY = 20
const RUN_RETENTION_SECONDS = 60 * 60 * 24 * 90

const creditStateSchema = z.enum([
  "not_reserved",
  "reserved",
  "committed",
  "refunded",
  "rejected",
  "reconciliation",
])

const runRecordSchema = z
  .object({
    id: z.string().regex(/^content-run-[A-Za-z0-9-]{8,80}$/),
    ownerSubject: z.string(),
    idempotencyKey: contentAgentIdempotencyKeySchema,
    inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    agentVersion: z.literal(CONTENT_AGENT_VERSION),
    input: contentAgentInputSchema,
    status: contentAgentRunStatusSchema,
    creditState: creditStateSchema,
    pendingOutput: contentAgentOutputSchema.nullable(),
    output: contentAgentOutputSchema.nullable(),
    errorCode: contentAgentRunErrorCodeSchema.nullable(),
    revision: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((record, context) => {
    if (!isStableCustomerSubject(record.ownerSubject)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid run owner" })
    }

    const hasTerminalError = record.errorCode !== null
    if (["queued", "running", "succeeded"].includes(record.status) && hasTerminalError) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Unexpected run error" })
    }
    if (["failed", "refunded", "reconciliation"].includes(record.status) && !hasTerminalError) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Missing run error" })
    }
    if (record.status === "queued" && record.creditState !== "not_reserved") {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid queued credit state" })
    }
    if (record.status === "running" && record.creditState !== "reserved") {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid running credit state" })
    }
    if (
      record.status === "succeeded" &&
      (record.creditState !== "committed" || !record.output || record.pendingOutput)
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid succeeded run" })
    }
    if (
      record.status !== "succeeded" &&
      record.output !== null
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Unsafe public output state" })
    }
    if (record.status !== "running" && record.pendingOutput !== null) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Unsafe pending output state" })
    }
    if (record.status === "refunded" && record.creditState !== "refunded") {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid refunded credit state" })
    }
    if (record.status === "reconciliation" && record.creditState !== "reconciliation") {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid reconciliation state" })
    }
    if (
      record.status === "failed" &&
      !["not_reserved", "rejected"].includes(record.creditState)
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid failed credit state" })
    }
  })

export type ContentAgentRunStatus = z.infer<typeof contentAgentRunStatusSchema>
export type ContentAgentRunErrorCode = z.infer<typeof contentAgentRunErrorCodeSchema>
export type ContentAgentCreditState = z.infer<typeof creditStateSchema>
export type ContentAgentRunRecord = z.infer<typeof runRecordSchema>

export type PublicContentAgentRun = {
  id: string
  input: ContentAgentInput
  status: ContentAgentRunStatus
  creditState: ContentAgentCreditState
  output: ContentAgentOutput | null
  errorCode: ContentAgentRunErrorCode | null
  createdAt: string
  updatedAt: string
}

export type ContentAgentRunStoreErrorCode =
  | "CONTENT_RUN_INVALID_OWNER"
  | "CONTENT_RUN_INVALID_IDEMPOTENCY_KEY"
  | "CONTENT_RUN_IDEMPOTENCY_CONFLICT"
  | "CONTENT_RUN_NOT_FOUND"
  | "CONTENT_RUN_TRANSITION_CONFLICT"
  | "CONTENT_RUN_INVALID_RECORD"
  | "CONTENT_RUN_STORE_UNAVAILABLE"

export class ContentAgentRunStoreError extends Error {
  constructor(
    readonly code: ContentAgentRunStoreErrorCode,
    message: string,
    options: { cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = "ContentAgentRunStoreError"
  }
}

export type ContentAgentRunClaimCommand = {
  runKey: string
  listKey: string
  listMember: string
  runKeyPrefix: string
  maxHistory: number
  retentionSeconds: number
  score: number
  record: ContentAgentRunRecord
}

export type ContentAgentRunClaimResult = {
  status: "created" | "existing" | "conflict" | "corrupt"
  record?: unknown
}

export type ContentAgentRunGetCommand = {
  runKey: string
}

export type ContentAgentRunTransitionCommand = {
  runKey: string
  ownerSubject: string
  expectedRevision: number
  expectedStatuses: ContentAgentRunStatus[]
  record: ContentAgentRunRecord
}

export type ContentAgentRunTransitionResult = {
  status: "updated" | "not_found" | "owner_conflict" | "transition_conflict" | "corrupt"
  record?: unknown
}

export type ContentAgentRunListCommand = {
  listKey: string
  runKeyPrefix: string
  limit: number
}

export interface ContentAgentRunAdapter {
  claim(command: ContentAgentRunClaimCommand): Promise<ContentAgentRunClaimResult>
  get(command: ContentAgentRunGetCommand): Promise<unknown | null>
  compareAndSet(command: ContentAgentRunTransitionCommand): Promise<ContentAgentRunTransitionResult>
  list(command: ContentAgentRunListCommand): Promise<unknown[]>
}

const CLAIM_RUN_SCRIPT = `
  local existing = redis.call('GET', KEYS[1])
  if existing then
    local ok, decoded = pcall(cjson.decode, existing)
    if not ok then
      return {'corrupt'}
    end
    if decoded['inputFingerprint'] ~= ARGV[1] or decoded['idempotencyKey'] ~= ARGV[2] then
      return {'conflict', existing}
    end
    return {'existing', existing}
  end

  redis.call('SET', KEYS[1], ARGV[3], 'EX', ARGV[8])
  redis.call('ZADD', KEYS[2], ARGV[4], ARGV[5])
  local overflow = redis.call('ZCARD', KEYS[2]) - tonumber(ARGV[7])
  if overflow > 0 then
    local expired = redis.call('ZRANGE', KEYS[2], 0, overflow - 1)
    for _, member in ipairs(expired) do
      redis.call('DEL', ARGV[6] .. member)
      redis.call('ZREM', KEYS[2], member)
    end
  end
  redis.call('EXPIRE', KEYS[2], ARGV[8])
  return {'created', ARGV[3]}
`

const TRANSITION_RUN_SCRIPT = `
  local existing = redis.call('GET', KEYS[1])
  if not existing then
    return {'not_found'}
  end

  local ok, decoded = pcall(cjson.decode, existing)
  if not ok then
    return {'corrupt'}
  end
  if decoded['ownerSubject'] ~= ARGV[1] then
    return {'owner_conflict'}
  end
  if tonumber(decoded['revision']) ~= tonumber(ARGV[2]) then
    return {'transition_conflict', existing}
  end

  local allowed = false
  for expected in string.gmatch(ARGV[3], '([^,]+)') do
    if decoded['status'] == expected then
      allowed = true
    end
  end
  if not allowed then
    return {'transition_conflict', existing}
  end

  redis.call('SET', KEYS[1], ARGV[4], 'KEEPTTL')
  return {'updated', ARGV[4]}
`

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function parseRun(raw: unknown): ContentAgentRunRecord {
  let candidate = raw
  if (typeof raw === "string") {
    try {
      candidate = JSON.parse(raw)
    } catch {
      throw new ContentAgentRunStoreError(
        "CONTENT_RUN_INVALID_RECORD",
        "Content run persistence returned invalid data",
      )
    }
  }

  const parsed = runRecordSchema.safeParse(candidate)
  if (!parsed.success) {
    throw new ContentAgentRunStoreError(
      "CONTENT_RUN_INVALID_RECORD",
      "Content run persistence returned invalid data",
    )
  }
  return parsed.data
}

function parseEvalResult(raw: unknown): unknown[] {
  if (!Array.isArray(raw) || typeof raw[0] !== "string") {
    throw new ContentAgentRunStoreError(
      "CONTENT_RUN_INVALID_RECORD",
      "Content run persistence returned an invalid operation result",
    )
  }
  return raw
}

export class UpstashContentAgentRunAdapter implements ContentAgentRunAdapter {
  constructor(private readonly redis: Pick<Redis, "eval" | "get" | "zrange">) {}

  async claim(command: ContentAgentRunClaimCommand): Promise<ContentAgentRunClaimResult> {
    const raw = parseEvalResult(
      await this.redis.eval(
        CLAIM_RUN_SCRIPT,
        [command.runKey, command.listKey],
        [
          command.record.inputFingerprint,
          command.record.idempotencyKey,
          JSON.stringify(command.record),
          command.score,
          command.listMember,
          command.runKeyPrefix,
          command.maxHistory,
          command.retentionSeconds,
        ],
      ),
    )
    const status = raw[0]
    if (!["created", "existing", "conflict", "corrupt"].includes(String(status))) {
      return { status: "corrupt" }
    }
    return {
      status: status as ContentAgentRunClaimResult["status"],
      record: raw[1],
    }
  }

  async get(command: ContentAgentRunGetCommand): Promise<unknown | null> {
    return this.redis.get<unknown>(command.runKey)
  }

  async compareAndSet(
    command: ContentAgentRunTransitionCommand,
  ): Promise<ContentAgentRunTransitionResult> {
    const raw = parseEvalResult(
      await this.redis.eval(
        TRANSITION_RUN_SCRIPT,
        [command.runKey],
        [
          command.ownerSubject,
          command.expectedRevision,
          command.expectedStatuses.join(","),
          JSON.stringify(command.record),
        ],
      ),
    )
    const status = raw[0]
    if (
      ![
        "updated",
        "not_found",
        "owner_conflict",
        "transition_conflict",
        "corrupt",
      ].includes(String(status))
    ) {
      return { status: "corrupt" }
    }
    return {
      status: status as ContentAgentRunTransitionResult["status"],
      record: raw[1],
    }
  }

  async list(command: ContentAgentRunListCommand): Promise<unknown[]> {
    const members = await this.redis.zrange<string[]>(
      command.listKey,
      0,
      command.limit - 1,
      { rev: true },
    )
    return Promise.all(members.map((member) => this.redis.get<unknown>(`${command.runKeyPrefix}${member}`)))
  }
}

function validateOwner(ownerSubject: string): void {
  if (!isStableCustomerSubject(ownerSubject)) {
    throw new ContentAgentRunStoreError(
      "CONTENT_RUN_INVALID_OWNER",
      "A stable customer owner is required",
    )
  }
}

function operationKeys(ownerSubject: string, idempotencyKey: string) {
  const ownerHash = digest(ownerSubject)
  const idempotencyHash = digest(idempotencyKey)
  const runKeyPrefix = `ams:content-agent:run:${ownerHash}:`
  return {
    listKey: `ams:content-agent:runs:${ownerHash}`,
    listMember: idempotencyHash,
    runKeyPrefix,
    runKey: `${runKeyPrefix}${idempotencyHash}`,
  }
}

function ownedRun(raw: unknown, ownerSubject: string): ContentAgentRunRecord {
  const record = parseRun(raw)
  if (record.ownerSubject !== ownerSubject) {
    throw new ContentAgentRunStoreError(
      "CONTENT_RUN_INVALID_RECORD",
      "Content run ownership could not be verified",
    )
  }
  return record
}

export function toPublicContentAgentRun(record: ContentAgentRunRecord): PublicContentAgentRun {
  return {
    id: record.id,
    input: record.input,
    status: record.status,
    creditState: record.creditState,
    output: record.status === "succeeded" ? record.output : null,
    errorCode: record.errorCode,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export class ContentAgentRunStore {
  constructor(
    private readonly adapter: ContentAgentRunAdapter,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID,
  ) {}

  async claim(input: {
    ownerSubject: string
    idempotencyKey: string
    content: ContentAgentInput
  }): Promise<{ created: boolean; record: ContentAgentRunRecord }> {
    validateOwner(input.ownerSubject)
    const idempotency = contentAgentIdempotencyKeySchema.safeParse(input.idempotencyKey)
    if (!idempotency.success) {
      throw new ContentAgentRunStoreError(
        "CONTENT_RUN_INVALID_IDEMPOTENCY_KEY",
        "A bounded content run idempotency key is required",
      )
    }
    const content = contentAgentInputSchema.parse(input.content)
    const keys = operationKeys(input.ownerSubject, idempotency.data)
    const timestamp = this.now()
    const record = runRecordSchema.parse({
      id: `content-run-${this.createId()}`,
      ownerSubject: input.ownerSubject,
      idempotencyKey: idempotency.data,
      inputFingerprint: digest(JSON.stringify(content)),
      agentVersion: CONTENT_AGENT_VERSION,
      input: content,
      status: "queued",
      creditState: "not_reserved",
      pendingOutput: null,
      output: null,
      errorCode: null,
      revision: 0,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    })

    let result: ContentAgentRunClaimResult
    try {
      result = await this.adapter.claim({
        runKey: keys.runKey,
        listKey: keys.listKey,
        listMember: keys.listMember,
        runKeyPrefix: keys.runKeyPrefix,
        maxHistory: MAX_RUN_HISTORY,
        retentionSeconds: RUN_RETENTION_SECONDS,
        score: timestamp.getTime(),
        record,
      })
    } catch (error) {
      if (error instanceof ContentAgentRunStoreError) throw error
      throw new ContentAgentRunStoreError(
        "CONTENT_RUN_STORE_UNAVAILABLE",
        "Content run persistence is unavailable",
        { cause: error },
      )
    }

    if (result.status === "conflict") {
      throw new ContentAgentRunStoreError(
        "CONTENT_RUN_IDEMPOTENCY_CONFLICT",
        "The idempotency key is bound to different content input",
      )
    }
    if (result.status === "corrupt" || result.record === undefined) {
      throw new ContentAgentRunStoreError(
        "CONTENT_RUN_INVALID_RECORD",
        "Content run persistence returned invalid data",
      )
    }

    return {
      created: result.status === "created",
      record: ownedRun(result.record, input.ownerSubject),
    }
  }

  async transition(input: {
    ownerSubject: string
    idempotencyKey: string
    expectedStatuses: ContentAgentRunStatus[]
    status: ContentAgentRunStatus
    creditState: ContentAgentCreditState
    pendingOutput: ContentAgentOutput | null
    output: ContentAgentOutput | null
    errorCode: ContentAgentRunErrorCode | null
  }): Promise<ContentAgentRunRecord> {
    validateOwner(input.ownerSubject)
    const idempotency = contentAgentIdempotencyKeySchema.safeParse(input.idempotencyKey)
    if (!idempotency.success || input.expectedStatuses.length < 1) {
      throw new ContentAgentRunStoreError(
        "CONTENT_RUN_INVALID_IDEMPOTENCY_KEY",
        "A bounded content run idempotency key is required",
      )
    }
    const keys = operationKeys(input.ownerSubject, idempotency.data)

    let currentRaw: unknown | null
    try {
      currentRaw = await this.adapter.get({ runKey: keys.runKey })
    } catch (error) {
      throw new ContentAgentRunStoreError(
        "CONTENT_RUN_STORE_UNAVAILABLE",
        "Content run persistence is unavailable",
        { cause: error },
      )
    }
    if (currentRaw === null) {
      throw new ContentAgentRunStoreError("CONTENT_RUN_NOT_FOUND", "Content run was not found")
    }
    const current = ownedRun(currentRaw, input.ownerSubject)
    const next = runRecordSchema.parse({
      ...current,
      status: input.status,
      creditState: input.creditState,
      pendingOutput: input.pendingOutput,
      output: input.output,
      errorCode: input.errorCode,
      revision: current.revision + 1,
      updatedAt: this.now().toISOString(),
    })

    let result: ContentAgentRunTransitionResult
    try {
      result = await this.adapter.compareAndSet({
        runKey: keys.runKey,
        ownerSubject: input.ownerSubject,
        expectedRevision: current.revision,
        expectedStatuses: input.expectedStatuses,
        record: next,
      })
    } catch (error) {
      if (error instanceof ContentAgentRunStoreError) throw error
      throw new ContentAgentRunStoreError(
        "CONTENT_RUN_STORE_UNAVAILABLE",
        "Content run persistence is unavailable",
        { cause: error },
      )
    }

    if (result.status === "not_found") {
      throw new ContentAgentRunStoreError("CONTENT_RUN_NOT_FOUND", "Content run was not found")
    }
    if (["owner_conflict", "transition_conflict"].includes(result.status)) {
      throw new ContentAgentRunStoreError(
        "CONTENT_RUN_TRANSITION_CONFLICT",
        "Content run state changed concurrently",
      )
    }
    if (result.status !== "updated" || result.record === undefined) {
      throw new ContentAgentRunStoreError(
        "CONTENT_RUN_INVALID_RECORD",
        "Content run persistence returned invalid data",
      )
    }
    return ownedRun(result.record, input.ownerSubject)
  }

  async listForOwner(ownerSubject: string, limit = 10): Promise<PublicContentAgentRun[]> {
    validateOwner(ownerSubject)
    const safeLimit = Math.min(MAX_RUN_HISTORY, Math.max(1, Math.floor(limit)))
    const keys = operationKeys(ownerSubject, "content-list-placeholder")
    let records: unknown[]
    try {
      records = await this.adapter.list({
        listKey: keys.listKey,
        runKeyPrefix: keys.runKeyPrefix,
        limit: safeLimit,
      })
    } catch (error) {
      throw new ContentAgentRunStoreError(
        "CONTENT_RUN_STORE_UNAVAILABLE",
        "Content run persistence is unavailable",
        { cause: error },
      )
    }

    return records
      .filter((record) => record !== null && record !== undefined)
      .map((record) => toPublicContentAgentRun(ownedRun(record, ownerSubject)))
  }
}

let defaultRunStore: ContentAgentRunStore | null = null

export function getContentAgentRunStore(): ContentAgentRunStore {
  if (defaultRunStore) return defaultRunStore

  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)?.trim()
  if (!url || !token) {
    throw new ContentAgentRunStoreError(
      "CONTENT_RUN_STORE_UNAVAILABLE",
      "Content run persistence is not configured",
    )
  }

  defaultRunStore = new ContentAgentRunStore(
    new UpstashContentAgentRunAdapter(new Redis({ url, token })),
  )
  return defaultRunStore
}
