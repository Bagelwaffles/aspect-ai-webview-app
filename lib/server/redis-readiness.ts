import { Redis } from "@upstash/redis"

export type RedisReadinessState = "ready" | "missing" | "unavailable"
export type RedisFailureCategory = "auth" | "endpoint" | "network" | "rate_limited" | "timeout" | "unexpected_response" | "unknown"

export type RedisReadinessResult = {
  state: RedisReadinessState
  configured: boolean
  checked: boolean
  latencyMs: number | null
  /** A fixed category only. Never return exception messages, credentials, or URLs. */
  failureCategory?: RedisFailureCategory
}

type RedisPingClient = Pick<Redis, "ping">

const DEFAULT_TIMEOUT_MS = 2_000

function classifyRedisFailure(error: unknown): RedisFailureCategory {
  const candidate = typeof error === "object" && error !== null
    ? error as { status?: unknown; statusCode?: unknown; code?: unknown; message?: unknown }
    : {}
  const status = Number(candidate.status ?? candidate.statusCode)
  const code = typeof candidate.code === "string" ? candidate.code : ""
  const message = typeof candidate.message === "string" ? candidate.message : ""
  if (message === "REDIS_READINESS_TIMEOUT") return "timeout"
  if (status === 401 || status === 403 || /\b(?:NOAUTH|WRONGPASS|unauthoriz(?:ed)?|forbidden|invalid token)\b/iu.test(message)) {
    return "auth"
  }
  if (status === 404 || /\b(?:not found|unknown endpoint)\b/iu.test(message)) return "endpoint"
  if (status === 429 || /\b(?:rate limit|too many requests)\b/iu.test(message)) return "rate_limited"
  if (/\b(?:ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|fetch failed|network error|certificate)\b/iu.test(code + " " + message)) {
    return "network"
  }
  return "unknown"
}

function redisConfiguration(): { url: string; token: string } | null {
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)?.trim()

  return url && token ? { url, token } : null
}

/**
 * Direct REST transport probe for an explicitly isolated Preview diagnosis only.
 * No raw errors, headers, response bodies, URLs, or credentials are returned.
 * This does not override the normal Redis client health result.
 */
export async function probeRedisRestTransport(
  configuration: { url: string; token: string } | null = redisConfiguration(),
  request: typeof fetch = fetch,
): Promise<RedisFailureCategory | "transport_ok" | "not_configured"> {
  if (!configuration) return "not_configured"
  try {
    const response = await request(configuration.url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${configuration.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["PING"]),
      signal: AbortSignal.timeout(1_500),
      cache: "no-store",
    })
    if (response.status === 401 || response.status === 403) return "auth"
    if (response.status === 404) return "endpoint"
    if (response.status === 429) return "rate_limited"
    if (!response.ok) return "unknown"
    const body: unknown = await response.json().catch(() => null)
    if (body && typeof body === "object" && "result" in body && String(body.result).toUpperCase() === "PONG") {
      return "transport_ok"
    }
    return "unexpected_response"
  } catch (error) {
    return classifyRedisFailure(error)
  }
}

export function isRedisPersistenceConfigured(): boolean {
  return redisConfiguration() !== null
}

export function createRedisReadinessClient(): RedisPingClient | null {
  const configuration = redisConfiguration()
  return configuration ? new Redis(configuration) : null
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("REDIS_READINESS_TIMEOUT")), timeoutMs)

    promise.then(
      (value) => {
        clearTimeout(timeout)
        resolve(value)
      },
      (error) => {
        clearTimeout(timeout)
        reject(error)
      },
    )
  })
}

export async function checkRedisReadiness(
  client: RedisPingClient | null = createRedisReadinessClient(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<RedisReadinessResult> {
  if (!client) {
    return {
      state: "missing",
      configured: false,
      checked: false,
      latencyMs: null,
    }
  }

  const startedAt = Date.now()

  try {
    const response = await withTimeout(client.ping(), timeoutMs)
    const latencyMs = Date.now() - startedAt

    if (String(response).toUpperCase() !== "PONG") {
      return {
        state: "unavailable",
        configured: true,
        checked: true,
        latencyMs,
        failureCategory: "unexpected_response",
      }
    }

    return {
      state: "ready",
      configured: true,
      checked: true,
      latencyMs,
    }
  } catch (error) {
    return {
      state: "unavailable",
      configured: true,
      checked: true,
      latencyMs: Date.now() - startedAt,
      failureCategory: classifyRedisFailure(error),
    }
  }
}
