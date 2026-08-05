import { randomUUID } from "node:crypto"

import { Redis } from "@upstash/redis"
import { z } from "zod"

type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | { [key: string]: JsonValue } | JsonValue[]

export interface AmsN8nWebhookRequest {
  action: string
  payload?: Record<string, JsonValue>
  meta?: Record<string, JsonValue>
  requestId?: string
  idempotencyKey?: string
}

export interface AmsN8nWebhookResponse {
  ok: boolean
  request_id: string
  action: string
  status: "accepted" | "duplicate" | "rejected" | "failed"
  result?: JsonValue
  error?: {
    code: string
    message: string
  }
}

export interface AmsN8nWebhookClientConfig {
  webhookUrl: string
  internalKey: string
  appUrl?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  now?: () => Date
  idFactory?: () => string
}

export class AmsN8nWebhookClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 500,
  ) {
    super(message)
    this.name = "AmsN8nWebhookClientError"
  }
}

const REDACTED_KEYS = [
  "authorization",
  "cookie",
  "password",
  "secret",
  "signature",
  "token",
  "apiKey",
  "api_key",
  "key",
  "private",
  "ssn",
  "card",
]

const ALLOWED_ACTIONS = [
  "status.ping",
  "content.launch",
  "content.plan",
  "content.social",
  "content.email",
  "content.youtube",
  "affiliate.program_search",
  "affiliate.application_helper",
  "affiliate.link_manager",
] as const

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string().max(10_000),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema).max(100),
    z.record(jsonValueSchema),
  ]),
)

export const amsN8nGatewayRequestSchema = z
  .object({
    action: z.enum(ALLOWED_ACTIONS),
    payload: z.record(jsonValueSchema).default({}),
    meta: z.record(jsonValueSchema).optional(),
  })
  .strict()

function normalizeSecret(value: string) {
  return value.trim()
}

function isUnsafeSecret(value: string) {
  const normalized = normalizeSecret(value)
  return (
    normalized.length < 1 ||
    /^replace[-_ ]?me$/iu.test(normalized) ||
    /^changeme$/iu.test(normalized) ||
    /^placeholder$/iu.test(normalized) ||
    /^your[-_ ].*here$/iu.test(normalized) ||
    normalized.includes("<") ||
    normalized.includes(">")
  )
}

function assertServerOnly() {
  if (typeof window !== "undefined") {
    throw new AmsN8nWebhookClientError(
      "N8N_CLIENT_BROWSER_FORBIDDEN",
      "AMS n8n webhook client is server-side only",
    )
  }
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue)
  if (!value || typeof value !== "object") return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      const lower = key.toLowerCase()
      if (REDACTED_KEYS.some((blocked) => lower.includes(blocked.toLowerCase()))) {
        return [key, "[REDACTED]"]
      }
      return [key, redactValue(entry)]
    }),
  )
}

export function redactAmsN8nLogData(value: unknown): unknown {
  return redactValue(value)
}

type ResolvedAmsN8nWebhookClientConfig = Omit<
  AmsN8nWebhookClientConfig,
  "fetchImpl" | "now" | "idFactory" | "timeoutMs"
> & {
  fetchImpl: typeof fetch
  timeoutMs: number
  now: () => Date
  idFactory: () => string
}

function resolveConfig(config?: Partial<AmsN8nWebhookClientConfig>): ResolvedAmsN8nWebhookClientConfig {
  assertServerOnly()

  const webhookUrl = config?.webhookUrl ?? process.env.AMS_N8N_ORCHESTRATOR_WEBHOOK_URL
  const internalKey = config?.internalKey ?? process.env.AMS_N8N_INTERNAL_KEY
  const appUrl = config?.appUrl ?? process.env.AMS_APP_URL
  const timeoutMs = config?.timeoutMs ?? 8_000

  if (!webhookUrl?.trim()) {
    throw new AmsN8nWebhookClientError(
      "N8N_WEBHOOK_URL_MISSING",
      "AMS_N8N_ORCHESTRATOR_WEBHOOK_URL is not configured",
      503,
    )
  }

  if (!internalKey?.trim() || isUnsafeSecret(internalKey)) {
    throw new AmsN8nWebhookClientError(
      "N8N_INTERNAL_KEY_MISSING_OR_UNSAFE",
      "AMS_N8N_INTERNAL_KEY must be rotated and configured securely",
      503,
    )
  }

  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30_000) {
    throw new AmsN8nWebhookClientError(
      "N8N_WEBHOOK_TIMEOUT_INVALID",
      "AMS n8n webhook timeout must be between 1000ms and 30000ms",
      500,
    )
  }

  return {
    webhookUrl,
    internalKey,
    appUrl,
    fetchImpl: config?.fetchImpl ?? fetch,
    timeoutMs,
    now: config?.now ?? (() => new Date()),
    idFactory: config?.idFactory ?? randomUUID,
  }
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetchImpl(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AmsN8nWebhookClientError(
        "N8N_WEBHOOK_TIMEOUT",
        "n8n orchestrator timed out",
        504,
      )
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function sendAmsN8nWebhook(
  request: AmsN8nWebhookRequest,
  config?: Partial<AmsN8nWebhookClientConfig>,
): Promise<AmsN8nWebhookResponse> {
  const resolved = resolveConfig(config)
  const parsed = amsN8nGatewayRequestSchema.safeParse({
    action: request.action,
    payload: request.payload ?? {},
    meta: request.meta ?? {},
  })

  if (!parsed.success) {
    throw new AmsN8nWebhookClientError(
      "N8N_REQUEST_SCHEMA_INVALID",
      "AMS n8n request failed schema validation",
      400,
    )
  }

  const requestId = request.requestId?.trim() || resolved.idFactory()
  const idempotencyKey = request.idempotencyKey?.trim() || resolved.idFactory()
  const body = {
    request_id: requestId,
    action: parsed.data.action,
    payload: parsed.data.payload,
    meta: {
      ...(parsed.data.meta ?? {}),
      source: "ams-vercel-gateway",
      app_url: resolved.appUrl ?? null,
      sent_at: resolved.now().toISOString(),
    },
  }

  const response = await fetchWithTimeout(
    resolved.fetchImpl,
    resolved.webhookUrl,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "x-ams-internal-key": normalizeSecret(resolved.internalKey),
        "x-request-id": requestId,
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(body),
    },
    resolved.timeoutMs,
  )

  const responseJson = await response.json().catch(() => null)

  if (!response.ok) {
    return {
      ok: false,
      request_id: requestId,
      action: parsed.data.action,
      status: "failed",
      error: {
        code:
          typeof responseJson?.error?.code === "string"
            ? responseJson.error.code
            : `N8N_WEBHOOK_HTTP_${response.status}`,
        message: "n8n webhook request failed",
      },
    }
  }

  if (!responseJson || typeof responseJson !== "object") {
    return {
      ok: false,
      request_id: requestId,
      action: parsed.data.action,
      status: "failed",
      error: {
        code: "N8N_WEBHOOK_INVALID_RESPONSE",
        message: "n8n returned a non-JSON response",
      },
    }
  }

  return {
    ok: Boolean(responseJson.ok),
    request_id: typeof responseJson.request_id === "string" ? responseJson.request_id : requestId,
    action: typeof responseJson.action === "string" ? responseJson.action : parsed.data.action,
    status: responseJson.ok ? "accepted" : "rejected",
    result: responseJson.result as JsonValue | undefined,
    error:
      responseJson.error && typeof responseJson.error === "object"
        ? {
            code:
              typeof responseJson.error.code === "string"
                ? responseJson.error.code
                : "N8N_WEBHOOK_ERROR",
            message:
              typeof responseJson.error.message === "string"
                ? responseJson.error.message
                : "n8n returned an error",
          }
        : undefined,
  }
}

export interface AmsN8nIdempotencyStore {
  reserve(input: {
    key: string
    requestHash: string
    ttlSeconds: number
    requestId: string
  }): Promise<
    | { status: "reserved" }
    | { status: "duplicate"; response?: AmsN8nWebhookResponse }
    | { status: "conflict" }
  >
  complete(input: {
    key: string
    response: AmsN8nWebhookResponse
    ttlSeconds: number
  }): Promise<void>
}

const RESERVE_SCRIPT = `
  local existing = redis.call('GET', KEYS[1])
  if existing then
    return existing
  end

  redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
  return ''
`

function defaultRedisClient(): Pick<Redis, "eval" | "set"> | null {
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)?.trim()
  if (!url || !token) return null
  return new Redis({ url, token })
}

export class RedisAmsN8nIdempotencyStore implements AmsN8nIdempotencyStore {
  constructor(private readonly redis: Pick<Redis, "eval" | "set"> | null = defaultRedisClient()) {}

  async reserve(input: {
    key: string
    requestHash: string
    ttlSeconds: number
    requestId: string
  }) {
    if (!this.redis) throw new Error("REDIS_IDEMPOTENCY_UNCONFIGURED")

    const pending = {
      state: "pending",
      requestHash: input.requestHash,
      requestId: input.requestId,
    }
    const raw = await this.redis.eval(
      RESERVE_SCRIPT,
      [`ams:n8n:idempotency:${input.key}`],
      [JSON.stringify(pending), String(input.ttlSeconds)],
    )
    const existingText = typeof raw === "string" ? raw : String(raw ?? "")
    if (!existingText) return { status: "reserved" as const }

    const existing = JSON.parse(existingText) as {
      state?: string
      requestHash?: string
      response?: AmsN8nWebhookResponse
    }
    if (existing.requestHash !== input.requestHash) return { status: "conflict" as const }
    return {
      status: "duplicate" as const,
      response: existing.response,
    }
  }

  async complete(input: {
    key: string
    response: AmsN8nWebhookResponse
    ttlSeconds: number
  }) {
    if (!this.redis) throw new Error("REDIS_IDEMPOTENCY_UNCONFIGURED")

    await this.redis.set(
      `ams:n8n:idempotency:${input.key}`,
      JSON.stringify({ state: "complete", response: input.response }),
      { ex: input.ttlSeconds },
    )
  }
}
