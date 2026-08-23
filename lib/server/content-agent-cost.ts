import { randomUUID } from "node:crypto"

import { Redis } from "@upstash/redis"

export const DEFAULT_CONTENT_AGENT_MAX_REQUEST_COST_USD = 0.02
export const CONTENT_AGENT_COST_RETENTION_SECONDS = 60 * 60 * 24 * 90

export type ContentAgentCostReceipt = {
  id: string
  model: string
  costUsd: number
  maxCostUsd: number
  overLimit: boolean
  inputTokens: number | null
  outputTokens: number | null
  createdAt: string
}

export type ContentAgentCostErrorCode =
  | "CONTENT_AGENT_COST_GUARD_UNAVAILABLE"
  | "CONTENT_AGENT_COST_LIMIT_INVALID"
  | "CONTENT_AGENT_COST_METADATA_MISSING"
  | "CONTENT_AGENT_COST_LEDGER_FAILED"
  | "CONTENT_AGENT_COST_LIMIT_EXCEEDED"

export class ContentAgentCostGuardError extends Error {
  constructor(
    readonly code: ContentAgentCostErrorCode,
    message: string,
    options: { cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = "ContentAgentCostGuardError"
  }
}

type RedisLike = {
  set(key: string, value: string, options: { ex: number }): Promise<unknown>
  zadd(key: string, entry: { score: number; member: string }): Promise<unknown>
  expire(key: string, seconds: number): Promise<unknown>
}

export interface ContentAgentCostStore {
  record(receipt: ContentAgentCostReceipt): Promise<void>
}

function redisConfig(env: NodeJS.ProcessEnv = process.env) {
  const url = (env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL)?.trim()
  const token = (env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN)?.trim()
  return url && token ? { url, token } : null
}

export function isContentAgentCostLedgerConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(redisConfig(env))
}

export function getContentAgentMaxRequestCostUsd(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.AMS_CONTENT_AGENT_MAX_REQUEST_COST_USD?.trim()
  if (!raw) return DEFAULT_CONTENT_AGENT_MAX_REQUEST_COST_USD

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    throw new ContentAgentCostGuardError(
      "CONTENT_AGENT_COST_LIMIT_INVALID",
      "Content Agent request cost ceiling is invalid",
    )
  }
  return parsed
}

export class RedisContentAgentCostStore implements ContentAgentCostStore {
  private readonly indexKey = "ams:content-agent:cost:receipts"

  constructor(private readonly redis: RedisLike) {}

  async record(receipt: ContentAgentCostReceipt): Promise<void> {
    const receiptKey = `ams:content-agent:cost:receipt:${receipt.id}`
    try {
      await this.redis.set(receiptKey, JSON.stringify(receipt), {
        ex: CONTENT_AGENT_COST_RETENTION_SECONDS,
      })
      await this.redis.zadd(this.indexKey, {
        score: Date.parse(receipt.createdAt),
        member: receipt.id,
      })
      await this.redis.expire(this.indexKey, CONTENT_AGENT_COST_RETENTION_SECONDS)
    } catch (error) {
      throw new ContentAgentCostGuardError(
        "CONTENT_AGENT_COST_LEDGER_FAILED",
        "Content Agent cost receipt could not be persisted",
        { cause: error },
      )
    }
  }
}

export function getContentAgentCostStore(env: NodeJS.ProcessEnv = process.env): ContentAgentCostStore {
  const config = redisConfig(env)
  if (!config) {
    throw new ContentAgentCostGuardError(
      "CONTENT_AGENT_COST_GUARD_UNAVAILABLE",
      "Content Agent cost ledger is unavailable",
    )
  }
  return new RedisContentAgentCostStore(new Redis(config))
}

export function assertContentAgentCostGuardReady(env: NodeJS.ProcessEnv = process.env): {
  maxCostUsd: number
  store: ContentAgentCostStore
} {
  return {
    maxCostUsd: getContentAgentMaxRequestCostUsd(env),
    store: getContentAgentCostStore(env),
  }
}

function finiteTokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null
}

export function parseGatewayCostUsd(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ContentAgentCostGuardError(
      "CONTENT_AGENT_COST_METADATA_MISSING",
      "AI Gateway did not return a valid request cost",
    )
  }
  return parsed
}

export async function recordContentAgentGatewayCost(input: {
  model: string
  gatewayCost: unknown
  usage?: { inputTokens?: unknown; outputTokens?: unknown } | null
  maxCostUsd: number
  store: ContentAgentCostStore
  now?: () => Date
  createId?: () => string
}): Promise<ContentAgentCostReceipt> {
  const costUsd = parseGatewayCostUsd(input.gatewayCost)
  const createdAt = (input.now ?? (() => new Date()))().toISOString()
  const receipt: ContentAgentCostReceipt = {
    id: `content-cost-${(input.createId ?? randomUUID)()}`,
    model: input.model,
    costUsd,
    maxCostUsd: input.maxCostUsd,
    overLimit: costUsd > input.maxCostUsd,
    inputTokens: finiteTokenCount(input.usage?.inputTokens),
    outputTokens: finiteTokenCount(input.usage?.outputTokens),
    createdAt,
  }

  await input.store.record(receipt)

  if (receipt.overLimit) {
    throw new ContentAgentCostGuardError(
      "CONTENT_AGENT_COST_LIMIT_EXCEEDED",
      "Content Agent request exceeded the configured cost ceiling",
    )
  }

  return receipt
}
