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
  if (status === 401 || status === 403 || /\\b(?:NOAUTH|WRONGPASS|unauthoriz(?:ed)?|forbidden|invalid token)\\b/iu.test(message)) {
    return "auth"
  }
  if (status === 404 || /\\b(?:not found|unknown endpoint)\\b/iu.test(message)) return "endpoint"
  if (status === 429 || /\\b(?:rate limit|too many requests)\\b/iu.test(message)) return "rate_limited"
  if (/\\b(?:ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|fetch failed|network error|certificate)\\b/iu.test(code + " " + message)) {
    return "network"
  }
  return "unknown"
}

function redisConfiguration(): { url: string; token: string } | null {
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)?.trim()

  return url && token ? { url, token } : null
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
