import { createHash, randomUUID } from "node:crypto"

import { Redis } from "@upstash/redis"
import { z } from "zod"

import { isStableCustomerSubject } from "@/lib/auth"

export const ANALYTICS_RUN_RETENTION_SECONDS = 60 * 60 * 24 * 7
const MAX_HISTORY = 20

export const analyticsIdempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/)

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(jsonValueSchema)]),
)

const analyticsRunSchema = z.object({
  id: z.string().regex(/^analytics-run-[A-Za-z0-9-]{8,80}$/),
  ownerSubject: z.string(),
  idempotencyKey: analyticsIdempotencyKeySchema,
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  fileName: z.string().min(1).max(255),
  fileBytes: z.number().int().positive().max(2 * 1024 * 1024),
  status: z.enum(["running", "succeeded", "failed"]),
  result: jsonValueSchema.nullable(),
  errorCode: z.enum(["ANALYSIS_FAILED"]).nullable(),
  costCredits: z.literal(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict().superRefine((run, context) => {
  if (!isStableCustomerSubject(run.ownerSubject)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid run owner" })
  }
  if (run.status === "succeeded" && (run.result === null || run.errorCode !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid successful run" })
  }
  if (run.status === "failed" && (run.result !== null || run.errorCode === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid failed run" })
  }
  if (run.status === "running" && (run.result !== null || run.errorCode !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid running run" })
  }
})

export type AnalyticsRunRecord = z.infer<typeof analyticsRunSchema>
export type PublicAnalyticsRun = Omit<AnalyticsRunRecord, "ownerSubject" | "inputFingerprint">

export type AnalyticsClaimCommand = {
  runKey: string
  historyKey: string
  member: string
  score: number
  fingerprint: string
  idempotencyKey: string
  recordJson: string
  retentionSeconds: number
  maxHistory: number
  runKeyPrefix: string
}

export type AnalyticsClaimResult = { status: "created" | "existing" | "conflict"; record?: unknown }

export interface AnalyticsRunAdapter {
  claim(command: AnalyticsClaimCommand): Promise<AnalyticsClaimResult>
  setTerminal(input: { runKey: string; ownerSubject: string; recordJson: string; retentionSeconds: number }): Promise<boolean>
  list(input: { historyKey: string; runKeyPrefix: string; limit: number }): Promise<unknown[]>
}

const CLAIM_SCRIPT = `
  local existing = redis.call('GET', KEYS[1])
  if existing then
    local ok, decoded = pcall(cjson.decode, existing)
    if not ok or decoded['inputFingerprint'] ~= ARGV[1] or decoded['idempotencyKey'] ~= ARGV[2] then
      return {'conflict', existing}
    end
    return {'existing', existing}
  end
  redis.call('SET', KEYS[1], ARGV[3], 'EX', ARGV[4])
  redis.call('ZADD', KEYS[2], ARGV[5], ARGV[6])
  redis.call('EXPIRE', KEYS[2], ARGV[4])
  local stale = redis.call('ZRANGE', KEYS[2], 0, -(tonumber(ARGV[7]) + 1))
  for _, member in ipairs(stale) do redis.call('DEL', ARGV[8] .. member) end
  if #stale > 0 then redis.call('ZREM', KEYS[2], unpack(stale)) end
  return {'created', ARGV[3]}
`

const TERMINAL_SCRIPT = `
  local existing = redis.call('GET', KEYS[1])
  if not existing then return 0 end
  local ok, decoded = pcall(cjson.decode, existing)
  if not ok or decoded['ownerSubject'] ~= ARGV[1] or decoded['status'] ~= 'running' then return 0 end
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
  return 1
`

export class UpstashAnalyticsRunAdapter implements AnalyticsRunAdapter {
  constructor(private readonly redis: Pick<Redis, "eval" | "zrange" | "mget">) {}

  async claim(command: AnalyticsClaimCommand): Promise<AnalyticsClaimResult> {
    const raw = await this.redis.eval(CLAIM_SCRIPT, [command.runKey, command.historyKey], [
      command.fingerprint, command.idempotencyKey, command.recordJson,
      String(command.retentionSeconds), String(command.score), command.member,
      String(command.maxHistory), command.runKeyPrefix,
    ])
    if (!Array.isArray(raw) || !["created", "existing", "conflict"].includes(String(raw[0]))) {
      throw new Error("ANALYTICS_RUN_STORE_INVALID_RESPONSE")
    }
    return { status: String(raw[0]) as AnalyticsClaimResult["status"], record: raw[1] }
  }

  async setTerminal(input: { runKey: string; ownerSubject: string; recordJson: string; retentionSeconds: number }) {
    return Number(await this.redis.eval(TERMINAL_SCRIPT, [input.runKey], [input.ownerSubject, input.recordJson, String(input.retentionSeconds)])) === 1
  }

  async list(input: { historyKey: string; runKeyPrefix: string; limit: number }) {
    const members = await this.redis.zrange<string[]>(input.historyKey, 0, input.limit - 1, { rev: true })
    if (!members.length) return []
    return this.redis.mget(...members.map((member) => `${input.runKeyPrefix}${member}`))
  }
}

function ownerHash(subject: string) {
  if (!isStableCustomerSubject(subject)) throw new Error("ANALYTICS_RUN_INVALID_OWNER")
  return createHash("sha256").update(subject).digest("hex")
}

function parseRecord(value: unknown): AnalyticsRunRecord {
  const decoded = typeof value === "string" ? JSON.parse(value) : value
  return analyticsRunSchema.parse(decoded)
}

export function toPublicAnalyticsRun(run: AnalyticsRunRecord): PublicAnalyticsRun {
  return {
    id: run.id,
    idempotencyKey: run.idempotencyKey,
    fileName: run.fileName,
    fileBytes: run.fileBytes,
    status: run.status,
    result: run.result,
    errorCode: run.errorCode,
    costCredits: run.costCredits,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  }
}

export class AnalyticsRunStore {
  constructor(
    private readonly adapter: AnalyticsRunAdapter,
    private readonly now: () => Date = () => new Date(),
    private readonly id: () => string = () => `analytics-run-${randomUUID()}`,
  ) {}

  private keys(subject: string, idempotencyKey?: string) {
    const hash = ownerHash(subject)
    const prefix = `ams:analytics:runs:${hash}:`
    return { historyKey: `ams:analytics:history:${hash}`, prefix, runKey: idempotencyKey ? `${prefix}${idempotencyKey}` : "" }
  }

  async claim(input: { ownerSubject: string; idempotencyKey: string; fileName: string; fileBytes: number; fingerprint: string }) {
    const idempotencyKey = analyticsIdempotencyKeySchema.parse(input.idempotencyKey)
    const keys = this.keys(input.ownerSubject, idempotencyKey)
    const at = this.now()
    const record = analyticsRunSchema.parse({
      id: this.id(), ownerSubject: input.ownerSubject, idempotencyKey,
      inputFingerprint: input.fingerprint, fileName: input.fileName, fileBytes: input.fileBytes,
      status: "running", result: null, errorCode: null, costCredits: 0,
      createdAt: at.toISOString(), updatedAt: at.toISOString(),
    })
    const claimed = await this.adapter.claim({
      runKey: keys.runKey, historyKey: keys.historyKey, member: idempotencyKey,
      score: at.getTime(), fingerprint: input.fingerprint, idempotencyKey,
      recordJson: JSON.stringify(record), retentionSeconds: ANALYTICS_RUN_RETENTION_SECONDS,
      maxHistory: MAX_HISTORY, runKeyPrefix: keys.prefix,
    })
    return { status: claimed.status, record: claimed.status === "created" ? record : parseRecord(claimed.record) }
  }

  async finish(input: { ownerSubject: string; idempotencyKey: string; result?: unknown; failed?: boolean }) {
    const keys = this.keys(input.ownerSubject, input.idempotencyKey)
    const existing = await this.listForOwner(input.ownerSubject, MAX_HISTORY, true)
    const current = existing.find((run) => run.idempotencyKey === input.idempotencyKey)
    if (!current || current.status !== "running") throw new Error("ANALYTICS_RUN_TRANSITION_CONFLICT")
    const next = analyticsRunSchema.parse({
      ...current, ownerSubject: input.ownerSubject,
      status: input.failed ? "failed" : "succeeded",
      result: input.failed ? null : input.result,
      errorCode: input.failed ? "ANALYSIS_FAILED" : null,
      updatedAt: this.now().toISOString(),
    })
    if (!await this.adapter.setTerminal({ runKey: keys.runKey, ownerSubject: input.ownerSubject, recordJson: JSON.stringify(next), retentionSeconds: ANALYTICS_RUN_RETENTION_SECONDS })) {
      throw new Error("ANALYTICS_RUN_TRANSITION_CONFLICT")
    }
    return next
  }

  async listForOwner(subject: string, limit = MAX_HISTORY, internal = false): Promise<Array<AnalyticsRunRecord | PublicAnalyticsRun>> {
    const keys = this.keys(subject)
    const values = await this.adapter.list({ historyKey: keys.historyKey, runKeyPrefix: keys.prefix, limit: Math.max(1, Math.min(limit, MAX_HISTORY)) })
    const records = values.filter((value) => value != null).map(parseRecord)
    return internal ? records : records.map(toPublicAnalyticsRun)
  }
}

export function getAnalyticsRunStore() {
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)?.trim()
  if (!url || !token) throw new Error("ANALYTICS_RUN_STORE_UNAVAILABLE")
  const redis = new Redis({ url, token })
  return new AnalyticsRunStore(new UpstashAnalyticsRunAdapter(redis))
}
