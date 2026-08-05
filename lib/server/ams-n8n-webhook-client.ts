import { createHmac, randomUUID } from "node:crypto"

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
  status: "accepted" | "rejected" | "failed"
  result?: JsonValue
  error?: {
    code: string
    message: string
  }
}

export interface AmsN8nWebhookClientConfig {
  webhookUrl: string
  webhookSecret: string
  appUrl?: string
  fetchImpl?: typeof fetch
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
  "private",
  "ssn",
  "card",
]

function normalizeSecret(value: string) {
  return value.trim()
}

function isUnsafeSecret(value: string) {
  const normalized = normalizeSecret(value)
  return (
    normalized.length < 32 ||
    /^replace[-_ ]?me$/iu.test(normalized) ||
    /^changeme$/iu.test(normalized) ||
    /^placeholder$/iu.test(normalized) ||
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

export function signaturePayload(timestamp: string, rawBody: string) {
  return `${timestamp}.${rawBody}`
}

export function signAmsN8nBody(input: {
  timestamp: string
  rawBody: string
  webhookSecret: string
}) {
  const digest = createHmac("sha256", normalizeSecret(input.webhookSecret))
    .update(signaturePayload(input.timestamp, input.rawBody), "utf8")
    .digest("hex")

  return `sha256=${digest}`
}

type ResolvedAmsN8nWebhookClientConfig = Omit<
  AmsN8nWebhookClientConfig,
  "fetchImpl" | "now" | "idFactory"
> & {
  fetchImpl: typeof fetch
  now: () => Date
  idFactory: () => string
}

function resolveConfig(config?: Partial<AmsN8nWebhookClientConfig>): ResolvedAmsN8nWebhookClientConfig {
  assertServerOnly()

  const webhookUrl = config?.webhookUrl ?? process.env.AMS_N8N_ORCHESTRATOR_WEBHOOK_URL
  const webhookSecret = config?.webhookSecret ?? process.env.AMS_N8N_WEBHOOK_SECRET
  const appUrl = config?.appUrl ?? process.env.AMS_APP_URL

  if (!webhookUrl?.trim()) {
    throw new AmsN8nWebhookClientError(
      "N8N_WEBHOOK_URL_MISSING",
      "AMS_N8N_ORCHESTRATOR_WEBHOOK_URL is not configured",
      503,
    )
  }

  if (!webhookSecret?.trim() || isUnsafeSecret(webhookSecret)) {
    throw new AmsN8nWebhookClientError(
      "N8N_WEBHOOK_SECRET_MISSING_OR_UNSAFE",
      "AMS_N8N_WEBHOOK_SECRET must be rotated and configured securely",
      503,
    )
  }

  return {
    webhookUrl,
    webhookSecret,
    appUrl,
    fetchImpl: config?.fetchImpl ?? fetch,
    now: config?.now ?? (() => new Date()),
    idFactory: config?.idFactory ?? randomUUID,
  }
}

export async function sendAmsN8nWebhook(
  request: AmsN8nWebhookRequest,
  config?: Partial<AmsN8nWebhookClientConfig>,
): Promise<AmsN8nWebhookResponse> {
  const resolved = resolveConfig(config)
  const action = request.action?.trim()

  if (!action) {
    throw new AmsN8nWebhookClientError("N8N_ACTION_MISSING", "n8n action is required", 400)
  }

  const requestId = request.requestId?.trim() || resolved.idFactory()
  const idempotencyKey = request.idempotencyKey?.trim() || requestId
  const body = {
    request_id: requestId,
    action,
    payload: request.payload ?? {},
    meta: {
      ...(request.meta ?? {}),
      source: "ams-web",
      app_url: resolved.appUrl ?? null,
    },
  }
  const rawBody = JSON.stringify(body)
  const timestamp = resolved.now().toISOString()
  const signature = signAmsN8nBody({
    timestamp,
    rawBody,
    webhookSecret: resolved.webhookSecret,
  })

  const response = await resolved.fetchImpl(resolved.webhookUrl, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "x-ams-timestamp": timestamp,
      "x-ams-signature": signature,
      "x-request-id": requestId,
      "idempotency-key": idempotencyKey,
    },
    body: rawBody,
  })

  const responseJson = await response.json().catch(() => null)

  if (!response.ok) {
    return {
      ok: false,
      request_id: requestId,
      action,
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
      action,
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
    action: typeof responseJson.action === "string" ? responseJson.action : action,
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
